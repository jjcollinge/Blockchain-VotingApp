pragma solidity ^0.4.0;

contract VoteOff {

    address owner;
    mapping(string => int) votes;

    // Track current vote
    uint public currentProposalIndex = 0;
    bool public votingIsOpen = false;
    string[] public currentVoters;

    struct option {
        string name;
        uint count;
    }
    
    struct proposal {
        option optionA;
        option optionB;
    }

    proposal[5] proposals;

    // Constructor
    function VoteOff () {
        owner = msg.sender;
        
        // Create proposals
        proposals[0] = proposal({optionA: option({name: "Dennis Taylor", count: 0}),
                                 optionB: option({name: "Taylor Swift", count: 0})
                                });
        proposals[1] = proposal({optionA: option({name: "Mario", count: 0}),
                                 optionB: option({name: "Sonic", count: 0})
                                });
        proposals[2] = proposal({optionA: option({name: "Tea", count: 0}),
                                 optionB: option({name: "Coffee", count: 0})
                                });
        proposals[3] = proposal({optionA: option({name: "C#", count: 0}),
                                 optionB: option({name: "Java", count: 0})
                                });
        proposals[4] = proposal({optionA: option({name: "Netball", count: 0}),
                                 optionB: option({name: "Dressage", count: 0})
                                });
        votingIsOpen = true;
    }

    function submitVote(uint voteIndex, string voterId, int option) public returns (bool) {

        if(votingIsOpen) {  

            // Check they are voting on the correct vote
            if(voteIndex != currentProposalIndex)
                return false;

            // Grab voter from mapping   
            int vote = votes[voterId];

            // Haven't already voted
            if(vote == 0) {
                currentVoters.push(voterId);
            }

            // Write back
            votes[voterId] = option;

            return true; 
        }
        return false;
    }

    function getCurrentProposal() public returns (uint, string, string) {
        return (currentProposalIndex, proposals[currentProposalIndex].optionA.name, proposals[currentProposalIndex].optionB.name);
    }

    function getResults() public returns (string, uint, string, uint) {
        option optionA = proposals[currentProposalIndex].optionA;
        option optionB = proposals[currentProposalIndex].optionB;
        return (optionA.name, optionA.count, optionB.name, optionB.count);
    }

    function getCurrentVoters() public returns (uint) {
        return currentVoters.length;
    }

    function closeVote() public {
        // Stop voting
        votingIsOpen = false;

        // Aggregate votes
        for (var i = 0; i < currentVoters.length; i++) {

            var voterId = currentVoters[i];

            var vote = votes[voterId];

            if(vote == -1){
                proposals[currentProposalIndex].optionA.count++;
            } else if(vote == 1) {
                proposals[currentProposalIndex].optionB.count++;
            }
        }
    }

    function nextVote() public {
        
        // Clear voting data
        proposals[currentProposalIndex].optionA.count = 0;
        proposals[currentProposalIndex].optionB.count = 0;
        
        currentProposalIndex++;

        // Cycle every 'n' questions
        if(currentProposalIndex > 4) {
            currentProposalIndex = 0;
        }
        
        // Clear votes
        for (var i = 0; i < currentVoters.length; i++) {
            var voterId = currentVoters[i];
            votes[voterId] = 0;
        }

        // Clear voters
        currentVoters.length = 0;

        // Reopen voting
        votingIsOpen = true;
    }

}