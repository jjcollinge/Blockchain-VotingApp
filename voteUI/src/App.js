import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';

class App extends Component {
  constructor(props) {
    super(props)
    this.state = {
      title: "Blockchain Vote",
      optionA: "loading...",
      optionAEnabled: false,
      optionB: "loading...",
      optionBEnabled: false,
      showResults: false,
      results: "Results will be displayed when voting is closed.",
      proposalIndex: 0
    }
  }

  updateProposal() {
    var proposals = [{
      _optionA: "Alice",
      _optionB: "Lucy"
    },{
      _optionA: "Bryan",
      _optionB: "Matt"
    }]

    var proposal = proposals[this.state.proposalIndex];

    // Gets current proposal
    this.setState({
      optionA: proposal._optionA,
      optionAEnabled: true,
      optionB: proposal._optionB,
      optionBEnabled: true,
    })
  }

  submitVote(option) {
    console.log(option);
  }

  getResults() {
    // While no results
    setTimeout(function() {
      this.setState({
        results: "OptionA: 10, OptionB: 20",
        showResults: true
      })
    }, 1000);
  }

  handleClick(option) {
    this.submitVote(option);
    this.setState({optionAEnabled: false,
                   optionBEnabled: false,
                   showResults: true});
    // Wait for voting to end
    // Display results
    this.getResults();
    // Wait for next proposal
    // updateProposal
  }

  componentWillMount() {
    this.updateProposal();
  }

  render() {
    return (
      <div className="App">
        <div className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h2>{this.state.title}</h2>
        </div>
        <div className="App-proposal">
          <button className="App-optionA-btn" disabled={!this.state.optionAEnabled} onClick={() => this.handleClick("A")}>{this.state.optionA}</button>
          <p className="vs">vs</p>
          <button className="App-optionB-btn" disabled={!this.state.optionBEnabled} onClick={() => this.handleClick("B")}>{this.state.optionB}</button>
        </div>
        <div className={this.state.showResults ? 'App-results' : 'App-results-hidden'}>
          <p className="App-results-text">{this.state.results}</p>
        </div>
      </div>
    );
  }
}

export default App;
