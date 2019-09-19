const express = require('express');
const moviedb = require('./moviedb');

let port = Number(process.env.HTTP_PORT);
if (isNaN(port)) port = 8080;

const app = express();
app.use(express.json());

/*
 * Movie API
 */
app.get('/search/:query', (req, res) => {
    moviedb.find(req.params.query)
        .then(rows => res.json(rows.map(r => ({
            title: r.title,
            released: new Date(r.released).toDateString()
        }))))
        .catch(err => res.status(404).end("API server error" + err));
});

app.listen(port, () => console.log("Backend started on port", port));
