"use strict";

process.on('uncaughtException', err => {
	fs.appendFile('error.log', err.message + '\n',  err => {
		if (err) console.error('Failed to log error ' + err.message);
	});
});

const express = require('express');
const app = express();
app.use(express.urlencoded({extended: true, limit: '15mb'}));
const mustache = require('mustache-express');
app.engine('mustache',mustache());
app.set('view engine','mustache');
app.set('views',__dirname+'/views');

const fs = require('fs');
const cache = JSON.parse(fs.readFileSync('cache.json').toString());
const revisions = JSON.parse(fs.readFileSync('revisions.json').toString());
function updateCache(articleName, html) {
  cache[articleName].revisions = revisions[articleName];
  cache[articleName].cachedHtml = html;
  fs.writeFile('cache.json', JSON.stringify(cache), (err) => {
    if(err) throw err;
  });
}
function addItemToCache(item) {
  cache[item] = {
    revisions: -1 //means that no cache has been registered
  };
  fs.writeFile('cache.json',JSON.stringify(cache), (err) => {
    if(err) throw err;
  });
}
function updateRevisionsFile() {
  fs.writeFile('revisions.json', JSON.stringify(revisions), (err) => {
    if(err) throw err;
  });
}

function logEdit(user, page) {
	fs.appendFile('activity.log', `[${(new Date()).toUTCString()}] ${user} edited "${page}"\n`, err => {if (err) throw err;});
}

const showdown = require('showdown');
const converter = new showdown.Converter();
const sanitizeHtml = require('sanitize-html');

app.get('/article', (req,res) => {
	res.set('Content-Type', 'text/plain');
	res.status(404).send('404 Not Found. Were you looking for /article/<article name>?');
});
app.get('/article/:articleName',(req,res) => {
  const path = 'public/articles/'+req.params.articleName+'.md';
  fs.readFile(path, 'utf-8',(err,data) => {
    if(err) {
      if(err.code === 'ENOENT') res.status(404).send('No article with that name');
      else res.status(500).send('Server Error');
      return;
    }
    let resultHtml;
		if (!cache[req.params.articleName]) cache[req.params.articleName] = {revisions: -1, cachedHtml: ''};
    if(cache[req.params.articleName].revisions !== revisions[req.params.articleName]) {
      resultHtml = sanitizeHtml(converter.makeHtml(data.toString()), {
        allowedTags: [
          "address", "article", "aside", "footer", "header", "h1", "h2", "h3", "h4",
          "h5", "h6", "hgroup", "main", "nav", "section", "blockquote", "dd", "div",
          "dl", "dt", "figcaption", "figure", "hr", "li", "main", "ol", "p", "pre",
          "ul", "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn",
          "em", "i", "kbd", "mark", "q", "rb", "rp", "rt", "rtc", "ruby", "s", "samp",
          "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "caption",
          "col", "colgroup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "img", "strikethrough"
        ],
      });
      updateCache(req.params.articleName, resultHtml);
    } else {
      resultHtml = cache[req.params.articleName].cachedHtml;
    }
    res.render('article-page', {
      articleName: req.params.articleName,
      articleBody: resultHtml,
			loggedIn: !!req.get('X-Replit-User-Name')
    });
  });
});
app.get('/edit', (req,res) => {
	res.set('Content-Type', 'text/plain');
	res.status(404).send('404 Not Found. Were you looking for /edit/<article name>?');
});
app.get('/edit/:articleName', (req,res) => {
	if (!req.get('X-Replit-User-Name')) return res.redirect(401, '/login');
  const path = 'public/articles/'+req.params.articleName+'.md';
  fs.readFile(path, 'utf-8',(err,data) => {
    if(err && err.code !== 'ENOENT') {
      res.status(500).send('Server Error');
			return;
    }
    res.render('edit', {
      newPageMsg: (function() {
        if(err && err.code === 'ENOENT') {
          return req.params.articleName+' does not exist, so you will create a new article';
        } else {
          return '';
        }
      })(), 
      articleName: req.params.articleName,
      articleContent: data || ''
    });
  });
});
app.post('/edit/submit', (req,res) => {
	if (!req.get('X-Replit-User-Name')) return res.redirect(401, '/login');
  fs.writeFile('public/articles/'+req.body.articleName+'.md', req.body.articleContent, err => {
    if(err) {
      res.status(500).send('Server Error');
      return;
    }
    if(!revisions[req.body.articleName]) {
      revisions[req.body.articleName] = 0;
      addItemToCache(req.body.articleName);
    } else {
      ++revisions[req.body.articleName];
    }
    updateRevisionsFile();
    res.redirect('/article/'+req.body.articleName);
		logEdit(req.get('X-Replit-User-Name'), req.body.articleName);
  });
});
app.get('/index', (req,res) => {
  fs.readdir('public/articles', (err,files) => {
    if(err) {
      res.status(500).send('Server Error');
    }
    files.forEach((item,index) => {
      files[index] = item.replace('.md','');
    }); 
    res.render('index-of-articles', {
      listOfArticles: files
    });

  });
});
app.get('/', (req,res) => {
  res.render('index', {
		signed_in: !!req.get('X-Replit-User-Name')
	});
});
app.get('/login', (req,res) => {
	res.sendFile(__dirname + '/views/login.html');
});
app.get('/login/submit', (req,res) => {
	res.redirect('/');
});
app.listen(8080);