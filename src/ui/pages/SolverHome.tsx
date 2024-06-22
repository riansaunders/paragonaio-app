import React from "react";

export function SolverHome() {
  return (
    <div
      className={
        "h-screen w-screen bg-[#0a0a0a] flex flex-col justify-center items-center text-white"
      }
    >
      <img
        className="h-[126px] w-auto select-none animate-pulse"
        src="icont.png"
      />
      <h1 className={"text-lg"}>Waiting...</h1>
    </div>
  );
}
