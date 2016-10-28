import React, { Component } from 'react';
import logo from './logo.png';
import './App.css';
import Web3 from 'web3'

// Load ethereum client globally
var web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

var abi = [{"constant":true,"inputs":[],"name":"getCurrentVoters","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"currentVoters","outputs":[{"name":"","type":"string"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"currentProposalIndex","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"closeVote","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"votingIsOpen","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"getCurrentProposal","outputs":[{"name":"","type":"uint256"},{"name":"","type":"string"},{"name":"","type":"string"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"getResults","outputs":[{"name":"","type":"string"},{"name":"","type":"uint256"},{"name":"","type":"string"},{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"voterId","type":"string"}],"name":"canVote","outputs":[{"name":"","type":"bool"},{"name":"","type":"string"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"voteIndex","type":"uint256"},{"name":"voterId","type":"string"},{"name":"option","type":"int256"}],"name":"submitVote","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"nextVote","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"a","type":"string"},{"name":"b","type":"string"}],"name":"stringEquals","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"},{"inputs":[],"type":"constructor"}]

var address = '0x1962b6ebfdfd22346a056e78ca0aa97bee7dafe1';
var contract;

var defaultVotedMsg = "Thank you for voting! Results will be displayed when voting is closed.";

class App extends Component {

  constructor(props) {
    super(props)
    this.state = {
      title: "Blockchain Vote",
      username: "Username",
      showLogin: true,
      showUsername: false,
      showProposal: false,
      optionA: "loading...",
      optionAEnabled: false,
      optionB: "loading...",
      optionBEnabled: false,
      showResults: false,
      results: defaultVotedMsg,
      proposalIndex: -1,
      showError: false,
      error: ""
    }
    contract = web3.eth.contract(abi).at(address);
  }

  /**
   * nextProposal
   * ----------------
   * Assumes getting either initial proposal or client
   * has voted and is waiting for next proposal.
   */
  nextProposal() {
    var res;
    var self = this;

    // Poll the blockchain proposal to see if vote has progressed
    var timerId = setInterval(function () {
      res = contract.getCurrentProposal.call();
      var index = res[0].c[0]; // Unencoding BigNumber
      console.dir("Blockchain proposal index: " + index + "\nLocal proposal index: " + self.state.proposalIndex);

      // If blockchain index is different to client index...
      if (self.state.proposalIndex !== index) {
        // ...migrate to the blockchain index and stop checking
        self.setState({
          optionA: res[1],
          optionAEnabled: true,
          optionB: res[2],
          optionBEnabled: true,
          proposalIndex: index,
          showResults: false,
          results: defaultVotedMsg, // Reset message
          showError: false // Clear any errors
        });
        clearInterval(timerId);
      }
    }, 2000);
  }

  /**
   * submitVote
   * ----------------
   * Sends a the clients vote to the blockchain as a 
   * transaction ready to be mined.
   */
  submitVote(option) {
    var res = contract.canVote.call(this.state.username);
    var canVote = res[0];
    var reason = res[1];
    if (canVote) {
      console.log("Vote cast: " + option);
      contract.submitVote(this.state.proposalIndex, this.state.username, option);
      return true;
    } else {
      console.log("Cannot vote: " + reason);
      this.setState({
        error: reason
      });
      return false;
    }
  }

  /**
   * getResults
   * ----------------
   * Attempts to get the results of the current vote.
   * If the vote is still active - it will retry until
   * the vote has been closed and the votes are counted.
   */
  getResults() {
    var res;
    var self = this;
    var timerId = setInterval(function () {
      res = contract.getResults.call();
      var optionA = res[0];
      var optionB = res[2];
      var totalVotesForOptionA = res[1].c[0];
      var totalVotesForOptionB = res[3].c[0];
      console.log("Total votes for " + optionA + ":" + totalVotesForOptionA);
      console.log("Total votes for " + optionB + ":" + totalVotesForOptionB);

      if (totalVotesForOptionA !== 0 || totalVotesForOptionB !== 0) {
        // Votes are registered so assume voting closed
        var resultsString;
        var draw = totalVotesForOptionA === totalVotesForOptionB;
        if (draw) {
          resultsString = "Oooo it's a draw at " + totalVotesForOptionA + " vote(s) each!"
        } else {
          var [winner, winnerVotes, loser, loserVotes] = totalVotesForOptionA > totalVotesForOptionB ? [optionA, totalVotesForOptionA, optionB, totalVotesForOptionB] : [optionB, totalVotesForOptionB, optionA, totalVotesForOptionA];
          resultsString = winner + " wins with " + winnerVotes + " vote(s) to " + loser + "'s measly " + loserVotes + " vote(s)!";
        }
        self.setState({
          results: resultsString
        });
        clearInterval(timerId);
      }
    }, 2000)
  }

  /**
   * handleVoteClick
   * ----------------
   * Event handler fired when the client clicks on an option.
   * Will orchestrate the logical response to a client voting.
   */
  handleVoteClick(option) {
    var voted = this.submitVote(option);

    if (voted) {
      // Stop client voting again
      this.setState({
        optionAEnabled: false,
        optionBEnabled: false,
        showResults: true
      });
      this.getResults();
      this.nextProposal();
    } else {
      // Didn't vote for some reason - show error
      this.setState({
        showError: true
      });
      this.nextProposal();
    }
  }

  /**
   * handleUsernameChange
   * ----------------
   * Event handler fired when the user changes a character in the
   * username text box. This constantly updates the display until
   * the user locks the username by pressing submit.
   */
  handleUsernameChange(evt) {
    var uname = evt.target.value;
    uname = uname.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10).toUpperCase();
    console.dir("Set username to: " + uname);
    this.setState({
      username: uname,
    });
  }

  /**
   * Life cycle methods
   */
  componentWillMount() {
    this.nextProposal();
    web3.eth.defaultAccount = web3.eth.accounts[0];
  }

  render() {
    return (
      <div className="App">
        <div className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h2>{this.state.title}</h2>
        </div>
        <div className={this.state.showLogin ? 'App-login' : 'hidden'}>
          <p className="App-login-prompt">Please enter a username in the input field below to start voting.</p>
          <input type="text" className="App-login-text" placeholder="Username" onChange={this.handleUsernameChange.bind(this)}></input>
          <button className="App-login-btn" onClick={() => this.setState({ showLogin: false, showUsername: true, showProposal: true })}>Submit</button>
        </div>
        <div className={this.state.showUsername ? 'App-username' : 'hidden'}>
          <p> {this.state.username} </p>
        </div>
        <div className={this.state.showProposal ? 'App-proposal' : 'hidden'}>
          <button className="App-optionA-btn" disabled={!this.state.optionAEnabled} onClick={() => this.handleVoteClick("-1")}>{this.state.optionA}</button>
          <p className="vs">vs</p>
          <button className="App-optionB-btn" disabled={!this.state.optionBEnabled} onClick={() => this.handleVoteClick("1")}>{this.state.optionB}</button>
        </div>
        <div className={this.state.showResults ? 'App-results' : 'hidden'}>
          <p className="App-results-text">{this.state.results}</p>
        </div>
        <div className={this.state.showError ? 'App-error' : 'hidden'}>
          <p className="App-error-text">{this.state.error}</p>
        </div>
      </div>
    );
  }
}

export default App;
