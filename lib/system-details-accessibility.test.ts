import assert from "node:assert/strict";
import test from "node:test";
import { getNextProcessSortDirection, getProcessSortButtonLabel, getProcessTableCaption } from "./system-details-accessibility.ts";

test("describes the active sort field's current and next directions", () => {
  assert.equal(
    getProcessSortButtonLabel("CPU %", "descending", "ascending"),
    "Sort by CPU %, currently descending. Activate to sort CPU % ascending.",
  );
});

test("describes the next direction for an inactive sort field", () => {
  assert.equal(
    getProcessSortButtonLabel("Process", null, "ascending"),
    "Sort by Process, currently unsorted. Activate to sort Process ascending.",
  );
});

test("describes toggling from ascending to descending", () => {
  assert.equal(
    getProcessSortButtonLabel("PID", "ascending", "descending"),
    "Sort by PID, currently ascending. Activate to sort PID descending.",
  );
});

test("chooses the same direction as the existing sort behavior", () => {
  assert.equal(getNextProcessSortDirection({ label: "CPU %", numeric: true }, false, true), "descending");
  assert.equal(getNextProcessSortDirection({ label: "Process", numeric: false }, false, true), "ascending");
  assert.equal(getNextProcessSortDirection({ label: "PID", numeric: true }, true, true), "ascending");
  assert.equal(getNextProcessSortDirection({ label: "User", numeric: false }, true, false), "descending");
});


test("gives process tables a caption with their current sort", () => {
  assert.equal(
    getProcessTableCaption("Processor", "CPU %", "descending"),
    "Processor processes. Sorted by CPU % in descending order.",
  );
});
