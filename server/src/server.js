var express = require('express');
var reverseString = require('./util').reverseString;
var bodyParser = require('body-parser');

var app = express();

// Use text parser functionality of bodyParser.
app.use(bodyParser.text());
// Server all files in the client/build directory.
app.use(express.static('../client/build'));



app.listen(3000, function() {
	console.log('Example app listening on port 3000!');
});