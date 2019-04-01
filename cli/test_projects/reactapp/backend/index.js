const express = require('express');
const path = require('path');
const moviedb = require('./moviedb');

const port = 8080;

const app = express();
app.use(express.json());

/*
 * Movie API
 */
app.get('/api/search/:query', (req, res) => {
    moviedb.find(req.params.query)
        .then(rows => res.json(rows.map(r => ({
            title: r.title,
            released: new Date(r.released).toDateString()
        }))))
        .catch(err => res.status(404).end("" + err));
});

/*
 * Serve static files from 'build' directory
 */
const buildDir = path.join(path.dirname(__dirname), 'build');

app.use(express.static(buildDir));
app.get('/', (_req, res) => {
  res.sendFile(path.join(buildDir, 'index.html'));
});

app.listen(port, () => console.log("Backend started on port", port));
