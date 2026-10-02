"""Tests that don't need a Gemini key or a built FAISS index, so they can
run in CI without secrets. Retriever/executor/planner nodes hit the Gemini
API and are best covered with integration tests using a real (or recorded)
key - see README for how to run those."""

from src.tools import calculator


def test_calculator_basic():
    assert calculator.invoke({"expression": "2 + 2"}) == "4"


def test_calculator_order_of_operations():
    assert calculator.invoke({"expression": "2 + 3 * 4"}) == "14"


def test_calculator_rejects_bad_input():
    result = calculator.invoke({"expression": "__import__('os').system('ls')"})
    assert result.startswith("Error")
