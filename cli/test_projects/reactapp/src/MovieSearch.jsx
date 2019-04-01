import React, { Component } from 'react';
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

export default class MovieSearch extends Component {
  constructor(props) {
    super(props);
    this.state = {
      search: '',
      result: [],
      error: null
    };
  }

  handleChange = (event) => {
    this.setState({search: event.target.value});
    if (!event.target.value) this.setState({
      result: [],
      error: null
    });
  };

  handleSubmit = (event) => {
    event.preventDefault();
    if (!this.state.search) return;

    findMovie(this.state.search)
      .then(rows => this.setState({ result: rows, error: null }))
      .catch(err => {
        const error = err.message === "No movies found" ? err.message :
          `Error searching for '${this.state.search}': ${err.message}`;
        this.setState({ result: [], error });
      });
  };

  render() {
    return (
      <div className="text-center MovieSearch">
        <form className="form-inline Form" onSubmit={this.handleSubmit}>
          <div className="form-group">
            <label>Search for movies:</label>
            <input value={this.state.search} onChange={this.handleChange} className="form-control"/>
            <button type="submit" className="btn btn-primary">Search</button>
          </div>
        </form>


        {this.state.result.length === 0 ? null :
          <ReactTable className="Movies" data={this.state.result} {...tableParams} />}

        {this.state.error && <div className="Error">{this.state.error}</div> }
      </div>
    );
  }
}
