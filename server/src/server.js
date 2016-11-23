var express = require('express');
var reverseString = require('./util').reverseString;
var bodyParser = require('body-parser');
var readDocument = require('./database').readDocument;

var app = express();

// Use text parser functionality of bodyParser.
app.use(bodyParser.text());
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

app.listen(3000, function() {
	console.log('Example app listening on port 3000!');
});