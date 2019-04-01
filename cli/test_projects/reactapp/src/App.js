import React, { Component } from 'react';

import MovieSearch from './MovieSearch';
import './App.css';

class App extends Component {
  render() {
    return (
      <div className="fluid-container App text-center">
        <img src="https://unbounded.systems/wp-content/uploads/revslider/cloudvideo/Unbounded-U-Logo-120px.png" className="App-logo" alt="logo" />
        <p className="Title">Unbounded Movie Database</p>

        <MovieSearch />
      </div>
    );
  }
}
export default App;
