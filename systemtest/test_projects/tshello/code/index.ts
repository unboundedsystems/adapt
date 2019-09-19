import * as http from "http";

const srv = http.createServer((rq, rs) => {
    rs.end("Hello World! via TypeScript");
});
srv.listen(8080);
