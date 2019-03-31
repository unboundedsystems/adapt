import React, { Component } from 'react';
import './App.css';

class App extends Component {
  render() {
    return (
      <div className="App">
        <header className="App-header">
          <img src="https://unbounded.systems/wp-content/uploads/revslider/cloudvideo/Unbounded-U-Logo-120px.png" className="App-logo" alt="logo" />
          <p className="Title">Unbounded Movie Database</p>
          <SearchForm />
        </header>
      </div>
    );
  }
}

class SearchForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      search: '',
      result: '',
      movieClass: ''
    };
  }

  handleChange = (event) => {
    this.setState({search: event.target.value});
    if (!event.target.value) this.setState({
      result: '',
      movieClass: ''
    });
  };

  handleSubmit = (event) => {
    alert('Searching for: ' + this.state.search);
    this.setState({result: this.state.search + ': Movie not found'});
    this.setState({movieClass: 'Error'});
    event.preventDefault();
  };

  render() {
    return (
      <div>
        <form className="Form" onSubmit={this.handleSubmit}>
          <label>Search for a movie:</label>
          <input value={this.state.search} onChange={this.handleChange} />
          <input type="submit" value="Search" />
        </form>

        <div className={'Movie ' + this.state.movieClass}>{this.state.result}</div>
      </div>
    );
  }
}
export default App;
