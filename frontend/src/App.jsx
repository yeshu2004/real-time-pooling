// App.jsx
import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import axios from "axios";

const socket = io("http://localhost:5000");

function App() {
  const [role, setRole] = useState(null); // student or teacher
  const [name, setName] = useState(""); // User name
  const [userId, setUserId] = useState(null); // User ID from backend
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState([
    { content: "", isCorrect: false },
    { content: "", isCorrect: false },
    { content: "", isCorrect: false },
    { content: "", isCorrect: false },
  ]);
  const [timeLimit, setTimeLimit] = useState(0);
  const [currentPoll, setCurrentPoll] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [remainingTime, setRemainingTime] = useState(0);
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [correctOptions, setCorrectOptions] = useState([]);
  const [error, setError] = useState("");
  const [isUserCreated, setIsUserCreated] = useState(false);

  useEffect(() => {
    socket.on("new-poll", (poll) => {
      setCurrentPoll(poll);
      setRemainingTime(poll.timeLimit);
      setShowResults(false);
    });

    socket.on("timer-update", (time) => setRemainingTime(time));

    socket.on("poll-ended", ({ results, correctOptions }) => {
      setResults(results);
      setCorrectOptions(correctOptions);
      setShowResults(true);
    });

    if (role && isUserCreated) {
      socket.emit("get-current-poll");
    }

    return () => {
      socket.off("new-poll");
      socket.off("timer-update");
      socket.off("poll-ended");
    };
  }, [role, isUserCreated]);

  const handleRoleSelect = (r) => setRole(r);

  const createUser = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    try {
      setError("");
      const res = await axios.post("http://localhost:5000/api/create-user", {
        name,
        role,
      });
      setUserId(res.data._id);
      setIsUserCreated(true);
    } catch (err) {
      setError(err.response?.data?.error || "Error creating user");
    }
  };

  const handleStudentAnswer = () => {
    if (currentPoll && selectedOption !== null && userId) {
      socket.emit("submit-answer", {
        pollId: currentPoll._id,
        studentId: userId,
        selectedOption,
      });
      setSelectedOption(null); // Prevent multiple submits
    } else {
      setError("Unable to submit answer");
    }
  };

  const updateOption = (index, field, value) => {
    const newOptions = [...options];
    newOptions[index][field] = value;
    setOptions(newOptions);
  };

  const handleTeacherCreatePoll = async () => {
    if (!isUserCreated && !name.trim()) {
      setError("Name is required");
      return;
    }
    const filteredOptions = options.filter((opt) => opt.content.trim() !== "");
    if (!question.trim()) {
      setError("Question is required");
      return;
    }
    if (filteredOptions.length < 2) {
      setError("At least 2 options are required");
      return;
    }
    if (timeLimit <= 0) {
      setError("Time limit must be positive");
      return;
    }
    try {
      setError("");
      let createdBy = userId;
      if (!isUserCreated) {
        const r = await axios.post("http://localhost:5000/api/create-user", {
          name,
          role,
        });
        setUserId(r.data._id);
        setIsUserCreated(true);
        createdBy = r.data._id;
      }
      const res = await axios.post("http://localhost:5000/api/create-poll", {
        question,
        options: filteredOptions.map(({ content, isCorrect }) => ({ content, isCorrect })),
        timeLimit,
        createdBy,
      });
      console.log("Poll created:", res.data);
      // Clear form
      setQuestion("");
      setOptions([
        { content: "", isCorrect: false },
        { content: "", isCorrect: false },
        { content: "", isCorrect: false },
        { content: "", isCorrect: false },
      ]);
      setTimeLimit(0);
    } catch (err) {
      setError(err.response?.data?.error || "Error creating poll");
    }
  };

  if (!role) {
    return (
      <div className="bg-zinc-900 text-white h-screen w-full flex items-center justify-center text-xl">
        <div className="flex flex-col gap-5">
          <h1 className="text-center">Welcome to Live Polling</h1>
          <div className="flex items-center gap-2">
            <button className="bg-zinc-950 px-5 py-2 cursor-pointer" onClick={() => handleRoleSelect("student")}>
              I am a Student
            </button>
            <button className="bg-zinc-950 px-5 py-2 cursor-pointer" onClick={() => handleRoleSelect("teacher")}>
              I am a Teacher
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isUserCreated && role === "student") {
    return (
      <div className="bg-zinc-900 text-white h-screen w-full flex items-center justify-center text-xl">
        <div className="flex flex-col gap-5">
          <h1 className="">Enter Your Name (Student)</h1>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your Name"
          />
          <button onClick={createUser} className="bg-zinc-950 px-3 py-1 cursor-pointer">Continue</button>
        </div>
      </div>
    );
  }

  if (role === "student") {
    return (
      <div className="bg-zinc-900 text-white h-screen w-full flex items-center justify-center text-xl">
        <div className="">
          {currentPoll ? (
            <div className="flex flex-col gap-2 text-xl min-w-[365px]">
              <h2>{currentPoll.question}</h2>
              <p className="text-sm italic">Time Left: {remainingTime} seconds</p>
              {currentPoll.options.map((opt, idx) => (
                <button
                className="bg-zinc-800 py-2"
                  key={idx}
                  onClick={() => setSelectedOption(idx)}
                  disabled={remainingTime <= 0 || showResults}
                >
                  {opt.content}
                </button>
              ))}
              <button
              className="bg-zinc-950 px-5 py-3"
                onClick={handleStudentAnswer}
                disabled={
                  selectedOption === null || remainingTime <= 0 || showResults
                }
              >
                Submit
              </button>
            </div>
          ) : (
            <h1 className="font-semibold text-3xl">Waiting for Question...</h1>
          )}
          {error && <p style={{ color: "red" }}>{error}</p>}
          {showResults && (
            <div>
              <h2>Results:</h2>
              {currentPoll.options.map((opt, idx) => (
                <p key={idx}>
                  <div className="w-full bg-zinc-800 py-2">{opt.content}</div>: {results[idx]}%
                </p>
              ))}
              {/* <p>Correct Answer(s): {correctOptions.map(idx => currentPoll.options[idx].content).join(", ")}</p> */}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (role === "teacher") {
    return (
      <div className="bg-zinc-900 text-white h-screen w-full flex items-center justify-center text-xl">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">Create Poll</h1>
          {!isUserCreated && (
            <div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>
          )}
          {error && <p style={{ color: "red" }}>{error}</p>}
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Question"
          />
          <div className="flex justify-between">
            <h1>Options</h1>
            <h1>Correct</h1>
          </div>
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                value={opt.content}
                onChange={(e) => updateOption(idx, "content", e.target.value)}
                placeholder={`Option ${idx + 1}`}
              />
                <input
                  type="checkbox"
                  checked={opt.isCorrect}
                  onChange={(e) => updateOption(idx, "isCorrect", e.target.checked)}
                />
            </div>
          ))}
          <input
            type="number"
            value={timeLimit}
            onChange={(e) => setTimeLimit(parseInt(e.target.value) || 0)}
            placeholder="Time Limit (seconds)"
          />
          <button onClick={handleTeacherCreatePoll} className="bg-zinc-950 px-5 py-3 cursor-pointer uppercase text-lg">Start Poll</button>
          {currentPoll && (
            <div>
              <h2>Current Poll: {currentPoll.question}</h2>
              <p>Time Left: {remainingTime} seconds</p>
              {showResults && (
                <div>
                  <h3>Results:</h3>
                  {currentPoll.options.map((opt, idx) => (
                    <p key={idx}>
                      <div className="w-full bg-zinc-800">{opt.content}</div>: {results[idx]}%
                    </p>
                  ))}
                  {/* <p>Correct Answer(s): {correctOptions.map(idx => currentPoll.options[idx].content).join(", ")}</p> */}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null; // Fallback
}

export default App;