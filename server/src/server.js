var express = require('express');
var reverseString = require('./util').reverseString;
var bodyParser = require('body-parser');
var database = require('./database');
var readDocument = database.readDocument;
var StatusUpdateSchema = require('./schemas/statusupdate.json');
var validate = require('express-jsonschema').validate;
var writeDocument = database.writeDocument;
var addDocument = database.addDocument;

var app = express();

// Use text parser functionality of bodyParser.
app.use(bodyParser.text());
app.use(bodyParser.json());
// Server all files in the client/build directory.
app.use(express.static('../client/build'));


// GET feed
app.get('/user/:userid/feed', function(req, res) {
	var userid = req.params.userid;
	var fromUser = getUserIdFromToken(req.get('Authorization'));
	var useridNumber = parseInt(userid, 10);
	if (fromUser === useridNumber) {
		res.send(getFeedData(userid));
	} else {
		res.status(401).end();
	}
});
// POST /feeditem { userId: user, location: location, contents: contents}
app.post('/feeditem', validate({body: StatusUpdateSchema}), function(req, res) {
	var body = req.body;
	var fromUser = getUserIdFromToken(req.get('Authorization'));

	if (fromUser === body.userId) {
		var newUpdate = postStatusUpdate(body.userId, body.location,
			body.contents);
		res.status(201);
		res.set('Location', '/feeditem' + newUpdate._id);

		res.send(newUpdate);
	} else {
		res.status(401).end();
	}
});

app.post('/resetdb', function(req, res) {
	console.log('Resetting database...');
	database.resetDatabase();
	// Send back an empty response with status code 200.
	res.send();
})

app.put('/feeditem/:feeditemid/content', function(req, res) {
	var fromUser = getUserIdFromToken(req.get('Authorization'));
	var feedItemId = req.params.feeditemid;
	var feedItem = readDocument('feedItems', feedItemId);
	if (fromUser === feedItem.contents.author) {
		if (typeof(req.body) !== 'string') {
			res.status(400).end();
			return;
		}
		feedItem.contents.contents = req.body;
		writeDocument('feedItems', feedItem);
		res.send(getFeedItemSync(feedItemId));
	} else {
		res.status(401).end();
	}
})

app.delete('/feeditem/:feeditemid', function(req, res) {
	var fromUser = getUserIdFromToken(req.get('Authorization'));
	// Convert the parameter in the request string into integer.
	var feedItemId = parseInt(req.params.feeditemid, 10);
	// Read the feed item with that id.
	var feedItem = readDocument('feedItems', feedItemId);
	// Check if the author of this feed item is the one that currently is making the request.
	if (feedItem.contents.author === fromUser) {
		database.deleteDocument('feedItems', feedItemId);
		// Remove references to this feed item from all other feeds.
		var feeds = database.getCollection('feeds');
		var feedIds = Object.keys(feeds);
		feedIds.forEach((feedId) => {
			var feed = feeds[feedId];
			var itemIdx = feed.contents.indexOf(feedItemId);
			// If the content contains the removed feed.
			if (itemIdx !== -1) {
				// Remove it.
				feed.contents.splice(itemIdx, 1);
				// Update the feed in the database.
				database.writeDocument('feeds', feed);
			}
		});
		res.send();
	} else {
		res.status(401).end();
	}
});

app.put('/feeditem/:feeditemid/likelist/:userid', function(req, res) {
	// Parse the token for the user id that is making request.
	var fromUser = getUserIdFromToken(req.get('Authorization'));
	// Convert feed item id from string to integer.
	var feedItemId = parseInt(req.params.feeditemid, 10);
	// Convert user id from string to integer.
	var userId = parseInt(req.params.userid, 10);
	// Check if the user making PUT request is the one who is in the like list.
	// This condition does not call anything in the database.
	if (fromUser === userId) {
		// Read the feed item using the id.
		var feedItem = readDocument('feedItems', feedItemId);
		// Find the user id in the like list.
		if (feedItem.likeCounter.indexOf(userId) === -1) {
			// If not found, add it.
			feedItem.likeCounter.push(userId);
			// Update the feed item in the database.
			writeDocument('feedItems', feedItem);
		}
		//
		res.send(feedItem.likeCounter.map((userId) =>
			readDocument('users', userId)));
	}
	// The user making this request is not the one in the request url.
	else {
		// Response the status code of Unauthorized.
		res.status(401).end();
	}
});

app.delete('/feeditem/:feeditemid/likelist/:userid', function(req, res) {
	// Parse the token for the user id that is making request.
	var fromUser = getUserIdFromToken(req.get('Authorization'));
	// Convert feed item id from string to integer.
	var feedItemId = parseInt(req.params.feeditemid, 10);
	// Convert user id from string to integer.
	var userId = parseInt(req.params.userid, 10);
	// Check if the user making PUT request is the one who is in the like list.
	// This condition does not call anything in the database.
	if (fromUser === userId) {
		// Read the feed item using the id.
		var feedItem = readDocument('feedItems', feedItemId);
		// Find the user id in the like list.
		var likeIndex = feedItem.likeCounter.indexOf(userId);
		if (likeIndex !== -1) {
			// If found, remove it.
			feedItem.likeCounter.splice(likeIndex, 1);
			// Update the feed item in the database.
			writeDocument('feedItems', feedItem);
		}
		// Return a list of users that liked the feed item.
		res.send(feedItem.likeCounter.map((userId) =>
			readDocument('users', userId)));
	}
	// The user making this request is not the one in the request url.
	else {
		// Response the status code of Unauthorized.
		res.status(401).end();
	}
});

app.post('/search', function(req, res) {
	var fromUser = getUserIdFromToken(req.get('Authorization'));
	// Retrieve data about user that makes request.
	var user = readDocument('users', fromUser);
	if (typeof(req.body) === 'string') {
		var queryText = req.body.trim().toLowerCase();
		// Retrieve feed that belongs to the user, and read its content,
		// which is a list of feed item ids.
		var feedItemIDs = readDocument('feeds', user.feed).contents;
		res.send(
			// Filter feed item ids that its feed item's status text contains the query text.
			feedItemIDs.filter((feedItemID) => {
			var feedItem = readDocument('feedItems', feedItemID);
			return feedItem.contents.contents.toLowerCase().indexOf(queryText) !== -1;
		}).
		// For those qualifying feed item ids, return those feed items.
		map(getFeedItemSync));
	} else {
		res.status(400).end();
	}
})

// Post FeedItem.
function postStatusUpdate(user, location, contents) {
	var time = new Date().getTime();
	var newStatusUpdate = {
		'likeCounter': [],
		'type': 'statusUpdate',
		'contents': {
			'author': user,
			'postDate': time,
			'location': location,
			'contents': contents,
			'likeCounter': []
		},
		'comments': []
	};

	newStatusUpdate = addDocument('feedItems', newStatusUpdate);

	var userData = readDocument('users', user);
	var feedData = readDocument('feeds', userData.feed);
	feedData.contents.unshift(newStatusUpdate._id);

	writeDocument('feeds', feedData);

	return newStatusUpdate;
}

// Retrieve Id from token.
function getUserIdFromToken(authorizationLine) {
	try {
		var token = authorizationLine.slice(7);
		// Convert base64 string to a utf8 string.
		var regularString = new Buffer(token, 'base64').toString('utf8');
		// Convert utf8 string to a Javascript object.
		var tokenObj = JSON.parse(regularString);
		var id = tokenObj['id'];
		if (typeof(id) === 'number') {
			return id;
		} else {
			return -1;
		}
	} catch (e) {
		return -1;
	}
}

/**
 * Resolves a feed item. Internal to the server, since it's synchronous.
 */
function getFeedItemSync(feedItemId) {
  var feedItem = readDocument('feedItems', feedItemId);
  // Resolve 'like' counter.
  feedItem.likeCounter = feedItem.likeCounter.map((id) => readDocument('users', id));
  // Assuming a StatusUpdate. If we had other types of FeedItems in the DB, we would
  // need to check the type and have logic for each type.
  feedItem.contents.author = readDocument('users', feedItem.contents.author);
  // Resolve comment author.
  feedItem.comments.forEach((comment) => {
    comment.author = readDocument('users', comment.author);
  });
  return feedItem;
}

/**
 * Emulates a REST call to get the feed data for a particular user.
 */
function getFeedData(user, cb) {
  var userData = readDocument('users', user);
  var feedData = readDocument('feeds', userData.feed);
  // While map takes a callback, it is synchronous, not asynchronous.
  // It calls the callback immediately.
  feedData.contents = feedData.contents.map(getFeedItemSync);
  // Return FeedData with resolved references.
  return feedData;
}


app.use(function(err, req, res, next) {
	if (err.name === 'JsonSchemaValidation') {
		res.status(400).end();
	} else {
		next(err);
	}
});

app.listen(3000, function() {
	console.log('Example app listening on port 3000!');
});