// Load Libraries Express, Express Handlebar, Node Fetch, With Query, Mysql2
const express = require('express');
const hbs = require('express-handlebars');
const fetch = require('node-fetch');
const withQuery = require('with-query').default;
const mysql = require('mysql2/promise');
const morgan = require('morgan');

// Configure PORT
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000;

// Create an instance of express application
const app = express();

// Configure Handlebars
app.engine('hbs', hbs({ defaultLayout: 'default.hbs' }));
app.set('view engine', 'hbs');

// DATABASE
// Create the Database Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'goodreads',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionLimit: parseInt(process.env.DB_CONN_LIMIT) || 4,
    timezone: process.env.DB_TIMEZONE || '+08:00'
})

//Configure API_KEY
const NY_TIMES_API_KEY = process.env.API_KEY || '';
const NY_TIMES_BOOK_REVIEW_BASEURL = 'https://api.nytimes.com/svc/books/v3/reviews.json';

const bookLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'
, 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
const bookNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Use Morgan to Log all Http
app.use(morgan('combined'));

// Configure Application using Express
// Get Method
app.get('/', (req, res) => {
    res.status(200);
    res.type('text/html');
    res.render('bookstore', {
        bookLetters,
        bookNumbers
    })
})

const SQL_QUERY_BY_BOOK_START_WITH = 'select book_id, title from book2018 where title like ? order by title limit ? offset ?';
const SQL_QUERY_BY_BOOK_START_WITH_COUNT = 'select count(*) as total_book_count from book2018 where title like ? order by title';
const SQL_QUERY_BY_BOOK_ID = 'select * from book2018 where book_id = ?';


app.get('/getBook/:startWith', (req, res) => {

    let startWith = req.params.startWith;
    let limit = 10;
    let offset = parseInt(req.query.offset) || 0;

    pool.getConnection()
        .then(conn => {
            const param1 = Promise.resolve(conn);
            const param2 = conn.query(SQL_QUERY_BY_BOOK_START_WITH, [ `${startWith}%`, limit, offset ]);
            const param3 = conn.query(SQL_QUERY_BY_BOOK_START_WITH_COUNT, [ `${startWith}%` ]);
            return Promise.all([param1, param2, param3]);
        })
        .then(results => {
            const conn = results[0];
            const queryResults = results[1][0];
            const queryCountResults = results[2][0];
            let hasNext = (offset + limit) >= parseInt(queryCountResults[0].total_book_count) ? false : true;

            res.status(200);
            res.type('text/html');
            res.render('booktitle', {
                startWith,
                book: queryResults,
                hasResults: queryResults.length, 
                offset,
                prevOffset: Math.max(0, offset - limit),
                nextOffset: offset + limit,
                hasNext
            })

            conn.release();
        })
})

app.get('/getBookDetail/:bookId', (req, res) => {

    let bookId = req.params.bookId;

    pool.getConnection()
        .then(conn => {
            const param1 = Promise.resolve(conn);
            const param2 = conn.query(SQL_QUERY_BY_BOOK_ID, [ bookId ]);
            return Promise.all([ param1, param2 ]);
        })
        .then(results => {
            const conn = results[0];
            const queryResults = results[1][0];
            
            queryResults.map(d => {
                d.genres = d.genres.replaceAll('|', ", ");
                d.authors = d.authors.replaceAll('|', ", ");
            })

            res.status(200);
            // res.type('text/html');
            // res.render('bookdetail', {
            //     bookDetails: queryResults[0]
            // })
            res.format(
                {
                    'text/html': () => {
                        res.render('bookdetail', {
                            bookDetails: queryResults[0]
                        })
                    },
                    'application/json': () => {
                        res.json({
                            bookId: queryResults[0].book_id,
                            title: queryResults[0].title,
                            authors: [
                                queryResults[0].authors.split(',')
                            ],
                            summary: queryResults[0].summary,
                            pages: queryResults[0].pages,
                            rating: queryResults[0].rating,
                            ratingCount: queryResults[0].rating_count,
                            genre: [
                                queryResults[0].genres.split(',')
                            ]
                        })
                    },
                    'default': () => {
                        res.status(406)
                        res.type('text/plain')
                        res.send(`Not supported: ${req.get("Accept")}`)
                    }
                }
            )

            conn.release();
        })      
})

app.get('/getBookReview/:title/:author', (req, res) => {

    let title = req.params.title;
    let authors = req.params.author;

    let url = withQuery(NY_TIMES_BOOK_REVIEW_BASEURL, {
        title, 
        authors,
        'api-key': NY_TIMES_API_KEY
    })

    fetch(url)
        .then(results => {
            return results.json();
        })
        .then(results => {

            if(results.num_results <= 0)
            {
                res.status(404);
                res.type('text/html');
                res.send(`<h1>No Book Review Found for Title: ${title} and Author: ${authors}`);
            }
            else
            {
                res.status(200);
                res.type('text/html');
                res.render('bookreview', {
                    copyright: results.copyright,
                    bookReviews: results.results
                })
            }
        })
        .catch(err => {
            console.info('Error Occured', err);
        })
    
})

app.use(express.static(__dirname + '/public'));

// Configure Application to Send File or Redirect if does not get Processed by any middleware above
app.use( (req, res) => {
    res.status(404);
    res.type('text/html');
    res.sendFile(__dirname + '/public/404.html');
})

// Start Server/Express
app.listen(PORT, ()=> {
    console.info(`Server Started on PORT ${PORT} at ${new Date()}`);
})