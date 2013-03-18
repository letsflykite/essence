
/*
 * GET home page.
 */

var     path    = require('path')
    ,   fs      = require('fs')
    ,   async   = require('async')
    
    ,   authentication  = use('authentication')
    ,	database = use('database')
    ,	referal	 = use('referal')
    ;

var invite_accept = exports;


invite_accept.path   = {};
invite_accept.route  = {};

    
invite_accept.path.accept    = '/invite/:token?';
invite_accept.route.accept   = 
    function(quest, ponse)
    {       
        var friendToken = quest.params.token;
        var userId      = referal.userIdForToken(friendToken);
        
        database.getUserEntryByTwitterId(userId,
            function(err, userEntry)
            {
                if (err) 
                {
                    console.error('Cannot find userId: ' + userId);
                    return ponse.redirect('/');
                }
                else
                {
                    var title = 'Invitation from ' + userEntry.twitter.user.name;
                    var h1 = userEntry.twitter.user.name + ' invites you to try Essence ';
                    var avatarURL = userEntry.twitter.user.profile_image_url;

                    ponse.render('index', {
                                    title: title
                                 ,  customBrand: title
                                 ,  avatarURL: avatarURL
                                 ,  h1: h1
                                 ,  friendName: userEntry.twitter.user.name
                                 ,  options: {}
                        } );
                    
                }
            });

        
    };



