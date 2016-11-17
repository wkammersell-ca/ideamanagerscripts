var bodyParser = require('body-parser');
var https = require('https');
var querystring = require('querystring');
var fs = require('fs');
var _ = require('underscore');

var BRIGHTIDEA_ACCESS_TOKEN;
var TOKEN_FILE_PATH = 'token.txt';
var BRIGHTIDEA_HOST = 'rallydev.brightidea.com';
var BRIGHTIDEA_RENAMED_HOST = 'ideas.rallydev.com';

var SAFE_MODE_ARG = '--safe';
var ARCHIVE_OLD_WITH_LOW_CHIPS_ARG = '--archive_old_low_chips';
var CREATE_REVIEW_LIST_ARG = '--create_review_list';

var SUBMITTED_STATUS_ID = '7CA6F64B-54A6-4FD4-BAD1-00D331A30961';
var ARCHIVED_STATUS_ID = '9AE7A1DB-F3DE-4997-BA82-0BE7987A9ECB';

// vars for archiving old ideas with low chips
var CHIPS_CUTOFF = 7;
var COMMENT_TEXT = "I'm archiving this as it has " + CHIPS_CUTOFF + " or less chips in a year. Please resubmit if you still want this.";

// vars for creating review lists
var MAX_IDEAS = 15;
var REVIEWERS = [ 'Andrea', 'Marianne', 'Mia', 'Steph', 'William' ];
var REVIEW_LIST_FILTE_PATH = 'review_list.tsv';

console.log("Let's get started!");
console.log("First, let's read token.txt for login info");

fs.readFile( TOKEN_FILE_PATH, 'utf8', (err, data) => {
	if (err) {
		throw err;
	}
	
	// Assumes token.txt is the format type.code
	var code = data.split(':')[1];
	
	if( data.startsWith('authorization') ) {
		console.log("Let's convert an authorization code to a token");	
		getBrightIdeaTokenFromAutentication( code );
	} else {
		getBrightIdeaTokenFromRefresh( code );
	}
});

function getBrightIdeaTokenFromAutentication( code ){
	console.log("Converting code (" + code + ") to a token");
	var options = {
		hostname: 'auth.brightidea.com' ,
		path: '/_oauth2/token',
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		}
	};

	var payload = {
		'grant_type': 'authorization_code',
		'client_id': 'd33d3d7b9ab44ec09acfc0ab0f028834',
		'client_secret': '635a649e8e79434485be8fbb4d9ee8d9',
		'code': code,
		'redirect_uri': 'http%3A%2F%2Fwww.ca.com'
	};


	var req = https.request( options , resDetails => {
		resDetails.setEncoding( 'utf8' );
		resDetails.on('data', (d) => {
			var data = JSON.parse(d);
			BRIGHTIDEA_ACCESS_TOKEN = data.access_token;
			writeRefreshTokenToFile( data.refresh_token );
		});
	} );

	req.on( 'error' , function (e) {
		console.log( 'problem with request: ' + e.message );
	} );

	req.write( querystring.stringify( payload ) );
	req.end();
};

function getBrightIdeaTokenFromRefresh( refresh_token ) {
	console.log("Let's get an API token from Refresh Token");

	var options = {
		hostname: 'auth.brightidea.com' ,
		path: '/_oauth2/token',
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		}
	};

	var payload = {
		'grant_type': 'refresh_token',
		'client_id': 'd33d3d7b9ab44ec09acfc0ab0f028834',
		'client_secret': '635a649e8e79434485be8fbb4d9ee8d9',
		'refresh_token': refresh_token,
		'redirect_uri': 'http%3A%2F%2Fwww.ca.com'
	};


	var req = https.request( options , resDetails => {
		resDetails.setEncoding( 'utf8' );
		resDetails.on('data', (d) => {
			var data = JSON.parse(d);
			BRIGHTIDEA_ACCESS_TOKEN = data.access_token;
			writeRefreshTokenToFile( data.refresh_token );
		});
	});

	req.on( 'error' , function (e) {
		console.log( 'problem with request: ' + e.message );
	} );

	req.write( querystring.stringify( payload ) );
	req.end();
};

function writeRefreshTokenToFile( refresh_token ) {
	fs.writeFile(TOKEN_FILE_PATH, 'refresh:' + refresh_token, 'utf8', (err) => {
		if (err) throw err;
		// console.log( 'Access Token = ' + BRIGHTIDEA_ACCESS_TOKEN );
		if ( _.contains( process.argv, ARCHIVE_OLD_WITH_LOW_CHIPS_ARG  ) ) {
			getOldSubmittedIdeas( 1, [] );
		} else if ( _.contains( process.argv, CREATE_REVIEW_LIST_ARG  ) ) {
			getNewSubmittedIdeas( 1, [] );
		} else {
			console.log( 'Error: no script given. Options are ' + ARCHIVE_OLD_WITH_LOW_CHIPS_ARG + ' or ' + CREATE_REVIEW_LIST_ARG );
		}
	});
};

function getOldSubmittedIdeas( page_index, idea_ids ){
	console.log("Let's get the list of 'Submitted' ideas (page "+ page_index + ")...");
	
	var date_cutoff = new Date();
	date_cutoff.setFullYear( date_cutoff.getFullYear() - 1);
	
	var options = {
		hostname: BRIGHTIDEA_HOST,
		path: '/api3/idea?visible=1&status_id=' + SUBMITTED_STATUS_ID +
			'&order=' + encodeURIComponent('date_created ASC') +
			'&page_size=50&page=' + page_index,
		//path: '/api3/idea?idea_code=D4186', // Test Idea for playing with scripts
		method: 'GET',
		headers: {
			'Authorization': 'Bearer ' + BRIGHTIDEA_ACCESS_TOKEN
		}
	};
	
	var req = https.request( options , resDetails => {
		resDetails.setEncoding( 'utf8' );
		var data = '';
		
		resDetails.on('data', (d) => {
			data = data + d;
		});
		
		resDetails.on('end', () => {
			data = JSON.parse(data);
			
			var fetch_other_page = false;
			
			_.each(data.idea_list, function( idea ){
				if ( new Date( idea.date_created ) <= date_cutoff ) {
					fetch_other_page = true;
					
					if( idea.chips <= CHIPS_CUTOFF ) {
						idea_ids.push( idea.id );
						console.log( "Found " + idea.idea_code + " submitted on " + idea.date_created + " with " + idea.chips + " chips.");
					}
					
				} else {
					fetch_other_page = false;
				}
			},this);
			
			if( fetch_other_page ) {
				getOldSubmittedIdeas( page_index + 1, idea_ids );
			} else {
				console.log( 'Found ' + idea_ids.length + ' ideas.' );
				if ( _.contains( process.argv, SAFE_MODE_ARG  ) ) {
					console.log( 'Done [SAFE MODE]' );
				} else {
					commentIdea( 0, idea_ids );
				}
			}
		});
	} );

	req.on( 'error' , function (e) {
		console.log( 'problem with request: ' + e.message );
	} );

	req.end();
};

function commentIdea( index, idea_ids ){
	if ( index >= idea_ids.length ) {
		console.log('All done!');
	} else {
		console.log('Commenting idea #' + ( index + 1 ) + ' (' + idea_ids[ index ] + ')');
		
		var options = {
			"method": "POST",
			"hostname": BRIGHTIDEA_HOST,
			"path": "/api3/comment?idea_id=" + encodeURIComponent( idea_ids[ index ] ) +
				"&comment=" + encodeURIComponent( COMMENT_TEXT ),
			"headers": {
				"authorization": "Bearer " + BRIGHTIDEA_ACCESS_TOKEN,
				"content-type": "application/x-www-form-urlencoded",
			}
		};
	
		var req = https.request( options , resDetails => {
			resDetails.setEncoding( 'utf8' );
		
			var data = '';
		
			resDetails.on('data', (d) => {
				data = data + d;
			});
		
			resDetails.on('end', () => {
				data = JSON.parse(data);
				archiveIdea( index, idea_ids );
			});
		} );

		req.on( 'error' , function (e) {
			console.log( 'problem with request: ' + e.message );
		} );

		req.end();
	}
};

function archiveIdea( index, idea_ids ){
	console.log('Archiving idea #' + ( index + 1 ) + ' (' + idea_ids[ index ] + ')');
	
	var options = {
		"method": "PUT",
		"hostname": BRIGHTIDEA_HOST,
		"path": "/api3/idea/" + encodeURIComponent( idea_ids[ index ] ) +
			"?status_id=" + encodeURIComponent( ARCHIVED_STATUS_ID ),
		"headers": {
			"authorization": "Bearer " + BRIGHTIDEA_ACCESS_TOKEN,
			"content-type": "application/x-www-form-urlencoded",
		}
	};
	
	var req = https.request( options , resDetails => {
		resDetails.setEncoding( 'utf8' );
		
		var data = '';
		
		resDetails.on('data', (d) => {
			data = data + d;
		});
		
		resDetails.on('end', () => {
			data = JSON.parse(data);
			commentIdea( index + 1, idea_ids );
		});
	} );

	req.on( 'error' , function (e) {
		console.log( 'problem with request: ' + e.message );
	} );

	req.end();
};

function getNewSubmittedIdeas( page_index, ideas ){
	console.log("Let's get the list of 'Submitted' ideas from this year (page "+ page_index + ")...");
	
	var date_cutoff = new Date();
	date_cutoff.setFullYear( date_cutoff.getFullYear() - 1);
	
	var options = {
		hostname: BRIGHTIDEA_HOST,
		path: '/api3/idea?visible=1&status_id=' + SUBMITTED_STATUS_ID +
			'&order=' + encodeURIComponent('date_created DESC') +
			'&page_size=50&page=' + page_index,
		method: 'GET',
		headers: {
			'Authorization': 'Bearer ' + BRIGHTIDEA_ACCESS_TOKEN
		}
	};
	
	var req = https.request( options , resDetails => {
		resDetails.setEncoding( 'utf8' );
		var data = '';
		
		resDetails.on('data', (d) => {
			data = data + d;
		});
		
		resDetails.on('end', () => {
			data = JSON.parse(data);
			
			var fetch_other_page = false;
			
			_.each(data.idea_list, function( idea ){
				if ( new Date( idea.date_created ) >= date_cutoff ) {
					fetch_other_page = true;
					ideas.push( idea );
					console.log( "Found " + idea.idea_code +
						" submitted on " + idea.date_created +
						" with " + idea.chips + " chips.");
				} else {
					fetch_other_page = false;
				}
			},this);
			
			if( fetch_other_page ) {
				getNewSubmittedIdeas( page_index + 1, ideas );
			} else {
				console.log( 'Found ' + ideas.length + ' ideas.' );
				if ( ideas.length >= ( MAX_IDEAS * REVIEWERS.length ) ) {
					divvyIdeas( ideas, {} );
				} else {
					getTopVotedSubmittedIdeas( 1, ideas );
				}
			}
		});
	} );

	req.on( 'error' , function (e) {
		console.log( 'problem with request: ' + e.message );
	} );

	req.end();
};

function getTopVotedSubmittedIdeas( page_index, ideas ){
	console.log("Let's get the top voted 'Submitted' ideas (page "+ page_index + ")...");
	
	var options = {
		hostname: BRIGHTIDEA_HOST,
		path: '/api3/idea?visible=1&status_id=' + SUBMITTED_STATUS_ID +
			'&order=' + encodeURIComponent('chips DESC') +
			'&page_size=50&page=' + page_index,
		method: 'GET',
		headers: {
			'Authorization': 'Bearer ' + BRIGHTIDEA_ACCESS_TOKEN
		}
	};
	
	var req = https.request( options , resDetails => {
		resDetails.setEncoding( 'utf8' );
		var data = '';
		
		resDetails.on('data', (d) => {
			data = data + d;
		});
		
		resDetails.on('end', () => {
			data = JSON.parse(data);
			
			var fetch_other_page = false;
			
			_.each(data.idea_list, function( idea ){
				ideas.push( idea );
				console.log( "Found " + idea.idea_code +
					" submitted on " + idea.date_created +
					" with " + idea.chips + " chips.");
			},this);
			
			if( ideas.length < ( MAX_IDEAS * REVIEWERS.length ) ) {
				//TODO - Check if there are no ideas left
				getTopVotedSubmittedIdeas( page_index + 1, ideas );
			} else {
				console.log( 'Found ' + ideas.length + ' ideas.' );
				if ( ideas.length >= ( MAX_IDEAS * REVIEWERS.length ) ) {
					divvyIdeas( ideas, {} );
				} else {
					console.log( 'Warning: We need more ideas!' );
					divvyIdeas( ideas, {} );
				}
			}
		});
	} );

	req.on( 'error' , function (e) {
		console.log( 'problem with request: ' + e.message );
	} );

	req.end();
};

function divvyIdeas( ideas, ideas_by_reviewer ){
	if( Object.keys( ideas_by_reviewer).length == 0 ) {
		_.each( REVIEWERS, function( reviewer ){
			ideas_by_reviewer[ reviewer ] = [];
		}, this);
	}
	
	var index = 0;
	_.each( ideas, function( idea ) {
		var reviwer_ideas = ideas_by_reviewer[ REVIEWERS[ index % REVIEWERS.length ] ];
		if( reviwer_ideas.length < MAX_IDEAS ) {
			reviwer_ideas.push( idea );
		}
		index++;
	}, this );
	
	outputReviewList( ideas_by_reviewer );
};

function outputReviewList( ideas_by_reviewer ) {
	var write_buffer = [
		'Reviewer',
		'Idea Code',
		'Category',
		'Date Created',
		'Submitter',
		'Title',
		'Description',
		'Status',
		'Chips',
		'Comments',
		'URL'
	].join( '	');
	
	_.each( REVIEWERS, function( reviewer ){
		_.each( ideas_by_reviewer[ reviewer ], function ( idea ) {
			write_buffer += String.fromCharCode(13); //new line
			write_buffer += [
				reviewer,
				idea.idea_code,
				idea.category.name,
				idea.date_created,
				idea.member.screen_name,
				idea.title,
				idea.description,
				idea.status.name,
				idea.chips,
				idea.comment_count,
				idea.url.replace( BRIGHTIDEA_HOST, BRIGHTIDEA_RENAMED_HOST )
			].join('	');
		}, this );	
	}, this );
	
	
	fs.writeFile(REVIEW_LIST_FILTE_PATH, write_buffer, 'utf8', (err) => {
		if (err) throw err;
		console.log('Review List written to: ' + REVIEW_LIST_FILTE_PATH );
	});
};