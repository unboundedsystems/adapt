const http = require("http");
const { getFirstMovieFromDB } = require("./db");

const srv = http.createServer((rq, rs) => {
    getFirstMovieFromDB()
        .then((name) => rs.end(`Hello World! The first movie is "${name}"!\n`))
        .catch((e) => { rs.writeHead(500); rs.end(e.message); });
});
srv.listen(8080);
