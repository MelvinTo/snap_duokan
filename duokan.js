var jsdom = require("jsdom")
var http = require('http')
var request = require('request')
request = request.defaults({followRedirect: false})
var _ = require('underscore');
var keychain = require('keychain');
var querystring = require('querystring')
var prompt = require('prompt');
var Q = require('q');

var app_title = "多看书抢拍器";
var config = get_config_from_file();
if(! config) {
  process.exit(1);
}

var jquery_url = "http://code.jquery.com/jquery.js";

var duokan_website = "www.duokan.com";
var duokan_check_url = 'http://www.duokan.com/store/v0/order/check_book';
var duokan_order_url = 'http://www.duokan.com/store/v0/payment/book/create';
var duokan_login_url = 'https://account.xiaomi.com/pass/serviceLoginAuth2';
var duokan_login_callback = 'http://login.dushu.xiaomi.com/dk_id/api/checkin?followup=http%3A%2F%2Fwww.duokan.com%3Fapp_id%3Dweb&sign=NGNmYWI3MjU0OTQwNjI1OTkwMDgzZDZlYWFkZmE4MTc=';
var duokan_login_sid = 'dushu';
var duokan_login_qs = '%3Fcallback%3Dhttp%253A%252F%252Flogin.dushu.xiaomi.com%252Fdk_id%252Fapi%252Fcheckin%253Ffollowup%253Dhttp%25253A%25252F%25252Fwww.duokan.com%25253Fapp_id%25253Dweb%2526sign%253DNGNmYWI3MjU0OTQwNjI1OTkwMDgzZDZlYWFkZmE4MTc%253D%26sid%3Ddushu';
var duokan_login_sign = 'Dy/DBI9rHd+kGx+1dSMKLChZod4=';

var duokan_auth_info = {};

// Working logic:
//  1. 
//  

main();



// p1.then(get_config('pwd', true, 'Please enter your duokan password', function(value) {
//   console.log(value);
// }));


function main() {

  // get_config('username', false, 'Please enter your duokan account')
  // .then(function(username) {

  //   get_config('pwd', true, 'Please enter your duokan password')
  //   .then(function(password) {

      username = config.duokan.username;
      password = config.duokan.password;

      console.log("Logging in duokan as " + username);

      // authenticate
      authc(username, password)
      .then(function(auth_info) {

        // get free books
        get_free_book_link()
        .then(get_real_book_url)
        .then(get_book_name)
        .then(function(book) {
          if(book.price === "0.0") {
            console.log("Today's free book: " + book.title);
            return check_if_ordered_already(book, auth_info);
          }
        }, function(error) {
          console.log(error);
        })
        .then(function(book) {
          take_free_books(book,auth_info);
        })
        .fail(function(error, book) {
          console.log("Failed to get book " + book.title + " because: " + error.message);
        })
        .then(function(book) {
          console.log("book [" + book.title + "] is NOW ordered!!");

        })
      })
      .fail(function(error) {
        console.log("Failed to login duokan, because: " + error.message);
      })
  //   })
  // });
}

// TODO: enable authentication

function get_free_book_link() {
  var deferred = Q.defer()

	jsdom.env(
 		"http://" + duokan_website,
  		[jquery_url],
  		function (errors, window) {
  			var href = window.$("img[alt='今日免费']").closest('a').attr('href');
        // console.log("Found the link for today's free book: " + href);
  			deferred.resolve(href);
  		}
	);

  return deferred.promise;
}

function get_real_book_url(url) {
  var deferred = Q.defer()

  var opts = {
    host: duokan_website,
    port: 80,
    path: url,
    method: 'GET'
  }

  var req = http.request(opts, function(res) {
    res.setEncoding('utf8')
    res.on('end', function() {
      var location = res.headers.location;
      // console.log("The original link of the book: " + location);
      deferred.resolve(location);
      //deferred.resolve("http://www.duokan.com/%E8%AF%91%E8%A8%80%C2%B7%E5%85%A8%E7%90%83%E4%B9%A6%E8%AF%84%EF%BC%88%E7%AC%AC16%E6%9C%9F%EF%BC%89/b/42386");
    })
  })

  req.end();

  return deferred.promise;
}

function parseCookies (list, cookie_string) {
    cookie_string && cookie_string.split(';').every(function( cookie ) {
        var parts = cookie.split('=');
        list[parts.shift().trim()] = unescape(parts.join('='));
        return false;
    });
}

var toType = function(obj) {
  return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase()
}

function get_config(type, hidden, description) {
  var deferred = Q.defer()

  keychain.getPassword({ account: type, service: app_title }, function(err, value) {
    if(err && err.message === "Could not find password") {
      var properties = [
        {
          name: type,
          hidden: hidden,
          description: description,
        }
      ];

      prompt.start();
      prompt.get(properties, function (err, result) {
        if (err) { 
          console.log(err.message);
          return;
        }
        console.log("Adding " + type + " into keychain");
        keychain.setPassword({ account: type, service: app_title, password: result[type] });
        deferred.resolve(result[type]);
      });
    } else {
        deferred.resolve(value);
    }

  });

  return deferred.promise;
}

function get_config_from_file() {
  var config = undefined;

  try {
    config = require('./config');
  } catch (err) {
    console.log("Failed to load config from config.js");
  }

  return config;
}

function authc(username, password) {
  var data = {
    passToken: '',
    user: username,
    pwd: password,
    callback: duokan_login_callback,
    sid: duokan_login_sid,
    qs: duokan_login_qs,
    hidden: '',
    _sign: duokan_login_sign
  }

  var deferred = Q.defer();


  request.post(duokan_login_url, {form:data}, function(error, response, body) {
    if (!error && response.statusCode == 302) {
      var location = response.headers.location;
      // console.log(location);
      request.get(location, function(error, response, body) {
        if (!error && response.statusCode == 302) {
          var location = response.headers.location;
          // console.log(location);
          request.get(location, function(error, response, body) {
            if (!error && response.statusCode == 302) {
              var cookie_list = {};
              response.headers['set-cookie'].forEach(function(cookie_string) {
                parseCookies(cookie_list, cookie_string);
              });
              // got new auth info, update the global variable.
              deferred.resolve(cookie_list);
//              console.log(duokan_auth_info);
            } else {
              console.log("fail to login duokan with username " + username);
            }
          });
        } else {
          console.log("fail to login duokan with username " + username);
        }
      });
    } else {
      console.log("fail to login duokan with username " + username);
    }
  });

  return deferred.promise;
}

function check_if_ordered_already(book, auth_info) {
  console.log("check if book " + book.title + " has already been ordered");

  var deferred = Q.defer();

  var data = _.extend({
    book_uuid : book.id
  }, auth_info);

  request.post(duokan_check_url, {form:data}, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var json_obj = JSON.parse(body);
      if (json_obj['result'] === 0) {
        // callback if ordered already
        console.log(new Error("book " + book.title + " has already been ordered").message);
        deferred.reject(new Error("book " + book.title + " has already been ordered"));
      } else {
        deferred.resolve(book);
      }
    } else {
      var msg = "failed to check if book has already been ordered";
      console.log(msg);
      deferred.reject(msg);
    }
  });

  return deferred.promise;
}

function take_free_books(book, auth_info) {
  var deferred = Q.defer();

  var data = _.extend({
    book_uuid : book.id
  }, auth_info);

  request.post(duokan_order_url, {form:data}, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var json_obj = JSON.parse(body);
      if (json_obj['result'] === 0 && json_obj['msg'] === "成功") {
        var notifier = require('node-notifier');
        notifier.notify({
          title: app_title,
          message: '成功抢到书 "' + book.title + '" !!!',
        });
        console.log('成功抢到书 "' + book.title + '" !!!');
        deferred.resolve(book);
      } else {
        deferred.reject(new Error('failed to order book ' + book.title + ", because: " + body), book);
      }
    }
  });

  return deferred.promise;
}

function get_book_name(url) {

  var deferred = Q.defer();

	jsdom.env({
    url: url,
    scripts: [jquery_url],
    features: {
            FetchExternalResources   : ['script'],
            ProcessExternalResources : ['script'],
            MutationEvents           : '2.0',
    },
    done: function (errors, window) {
        var book_id = window.dk_data.book_id;
        var book_title = window.dk_data.book.title;
        var price = window.dk_data.book.price;
        deferred.resolve({
          id: book_id,
          title: book_title,
          price: price,
        });
    }

  });	

  return deferred.promise;
}