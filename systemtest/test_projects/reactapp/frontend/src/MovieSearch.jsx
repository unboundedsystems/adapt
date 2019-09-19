import React, { useState } from 'react';
import ReactTable from 'react-table';
import 'react-table/react-table.css';


async function findMovie(text) {
  const res = await fetch(`/api/search/${text}`);
  if (res.ok) {
    const results = await res.json();
    if (results.length) return results;
    throw new Error(`No movies found`);
  }
  throw new Error(`API returned error ${res.status}: ${res.statusText}`);
}

const columns = [
  { Header: 'Title', accessor: 'title' },
  { Header: 'Release Date', accessor: 'released' }
];

const tableParams = {
  columns,
  showPagination: false,
  minRows: 0,
}

export default function MovieSearch(props) {
  const [ search, setSearch ] = useState('');
  const [ result, setResult ] = useState([]);
  const [ error, setError ] = useState(null);

  const update = (res, err) => {
    setResult(res);
    setError(err);
  };

  const handleChange = (event) => {
    const newSearch = event.target.value;
    setSearch(newSearch);

    if (!newSearch) return update([], null);

    findMovie(newSearch)
      .then(rows => update(rows, null))
      .catch(err => update([], err.message === "No movies found" ? err.message :
        `Error searching for '${newSearch}': ${err.message}`));
  };

  return (
    <div className="text-center MovieSearch">
      <form className="form-inline Form" onSubmit={e => e.preventDefault()}>
        <div className="form-group">
          <label>Search for movies:</label>
          <input value={search} onChange={handleChange} className="form-control"/>
        </div>
      </form>

      { result.length === 0 ? null :
        <ReactTable className="Movies" data={result} {...tableParams} /> }

      { error && <div className="Error">{error}</div> }
    </div>
  );
}
