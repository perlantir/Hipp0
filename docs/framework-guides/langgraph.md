# LangChain / LangGraph Integration Guide

The `hipp0-langchain` package provides three integration points for LangChain and LangGraph: a `BaseMemory` implementation that injects compiled Hipp0 context into chains, a `BaseCallbackHandler` that automatically captures LLM and tool outputs for distillation, and a `BaseCheckpointSaver` that stores LangGraph graph state as Hipp0 session summaries.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Installation](#installation)
- [Hipp0Memory — Chain Memory](#hipp0memory--chain-memory)
  - [Constructor Parameters](#constructor-parameters)
  - [With LLMChain](#with-llmchain)
  - [With LCEL (LangChain Expression Language)](#with-lcel-langchain-expression-language)
  - [Accessing Individual Decisions](#accessing-individual-decisions)
  - [Distillation Frequency](#distillation-frequency)
- [Hipp0CallbackHandler — Automatic Capture](#hipp0callbackhandler--automatic-capture)
  - [Constructor Parameters](#constructor-parameters-1)
  - [With any Chain or Agent](#with-any-chain-or-agent)
  - [Controlling What Gets Captured](#controlling-what-gets-captured)
  - [Manual Flush](#manual-flush)
- [Hipp0Checkpointer — LangGraph State Persistence](#hipp0checkpointer--langgraph-state-persistence)
  - [Constructor Parameters](#constructor-parameters-2)
  - [Basic LangGraph Integration](#basic-langgraph-integration)
  - [Multi-Agent Graph with Checkpointing](#multi-agent-graph-with-checkpointing)
  - [Resuming from a Checkpoint](#resuming-from-a-checkpoint)
- [Complete Example: Research Agent](#complete-example-research-agent)
- [Complete Example: Multi-Agent LangGraph](#complete-example-multi-agent-langgraph)
- [Configuration Reference](#configuration-reference)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## How It Works

### Memory Flow

```
LLMChain.invoke({"input": "..."})
    │
    ▼
Hipp0Memory.load_memory_variables(inputs)
    │── compile_context(agent_name, task_description)
    │      └── 5-signal scoring + graph BFS
    ▼
{"hipp0_context": "<compiled decisions>", ...}
    │
    ▼  (LLM generates response)
    │
Hipp0Memory.save_context(inputs, outputs)
    │── buffer exchange
    │── flush to distillery every N exchanges
    ▼
Hipp0 decision graph updated
```

### Callback Flow

```
chain.invoke(inputs, config={"callbacks": [handler]})
    │
    ├── on_chain_start  ──► buffer "Human Input"
    ├── on_llm_end      ──► buffer "LLM Output"
    ├── on_tool_end     ──► buffer "Tool: {name}"
    └── on_chain_end    ──► flush buffer to distillery
```

### Checkpointer Flow

```
graph.compile(checkpointer=Hipp0Checkpointer(...))

graph.invoke(state, config={"configurable": {"thread_id": "t1"}})
    │
    ├── put(config, checkpoint, metadata, ...)
    │       └── create_session_summary in Hipp0
    │
    └── get_tuple(config)
            └── list_session_summaries → deserialize checkpoint
```

---

## Installation

```bash
pip install hipp0-sdk hipp0-langchain langchain-core langchain-openai
```

For LangGraph checkpointing, also install:

```bash
pip install langgraph
```

Or install from the repository:

```bash
cd /path/to/hipp0/integrations/langchain
pip install -e .
```

**Supported versions:**
- Python 3.10+
- langchain-core ≥ 0.3.0
- langgraph ≥ 0.2 (for `Hipp0Checkpointer`)
- hipp0-sdk 0.1+

---

## Hipp0Memory — Chain Memory

`Hipp0Memory` extends LangChain's `BaseMemory`. Attach it to any chain to inject compiled Hipp0 context before each LLM call.

### Constructor Parameters

```python
Hipp0Memory(
    client: Hipp0Client,
    project_id: str,
    agent_name: str,
    task_description: str,
    memory_key: str = "hipp0_context",
    input_key: str = "input",
    output_key: str = "output",
    max_tokens: int | None = None,
    distill_every: int = 1,
    return_messages: bool = False,
)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `client` | `Hipp0Client` | required | Initialized Hipp0 client |
| `project_id` | `str` | required | Hipp0 project ID |
| `agent_name` | `str` | required | Agent name for context scoping |
| `task_description` | `str` | required | What the agent is doing — used to rank relevant decisions |
| `memory_key` | `str` | `"hipp0_context"` | Key injected into chain inputs |
| `input_key` | `str` | `"input"` | Key for the human input in chain inputs |
| `output_key` | `str` | `"output"` | Key for the AI response in chain outputs |
| `max_tokens` | `int \| None` | `None` | Token budget for context compilation |
| `distill_every` | `int` | `1` | Distil after every N exchanges (1 = every exchange) |
| `return_messages` | `bool` | `False` | Also return raw decision list under `hipp0_decisions` |

### With LLMChain

```python
from hipp0_sdk import Hipp0Client
from hipp0_langchain import Hipp0Memory
from langchain.chains import LLMChain
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

client = Hipp0Client(base_url="http://localhost:3100")

memory = Hipp0Memory(
    client=client,
    project_id="proj_01hx...",
    agent_name="coder-agent",
    task_description="Implement the authentication service using the decided architecture.",
    max_tokens=4096,
)

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a software engineer.\n\n{hipp0_context}"),
    ("human", "{input}"),
])

chain = LLMChain(
    llm=ChatOpenAI(model="gpt-4o"),
    prompt=prompt,
    memory=memory,
)

response = chain.invoke({"input": "How should I implement JWT refresh tokens?"})
print(response["text"])
```

The `{hipp0_context}` variable in the prompt is automatically populated with compiled decisions from Hipp0 before each invocation.

### With LCEL (LangChain Expression Language)

```python
from hipp0_sdk import Hipp0Client
from hipp0_langchain import Hipp0Memory
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough

client = Hipp0Client(base_url="http://localhost:3100")

memory = Hipp0Memory(
    client=client,
    project_id="proj_01hx...",
    agent_name="architect",
    task_description="Design the API authentication layer.",
)

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a software architect.\n\n{hipp0_context}"),
    ("human", "{input}"),
])

llm = ChatOpenAI(model="gpt-4o-mini")


def load_memory(inputs):
    """Load Hipp0 context and merge with chain inputs."""
    mem_vars = memory.load_memory_variables(inputs)
    return {**inputs, **mem_vars}


def save_memory(inputs_and_output):
    """Save the exchange to Hipp0 after the chain completes."""
    inputs, output = inputs_and_output
    memory.save_context(inputs, {"output": output.content})
    return output


chain = (
    RunnablePassthrough.assign(**{"hipp0_context": lambda x: memory.load_memory_variables(x)["hipp0_context"]})
    | prompt
    | llm
)

# Invoke
inputs = {"input": "What database should we use for the token store?"}
response = chain.invoke(inputs)
memory.save_context(inputs, {"output": response.content})

print(response.content)
```

### Accessing Individual Decisions

Set `return_messages=True` to also get the raw decision list:

```python
memory = Hipp0Memory(
    client=client,
    project_id="proj_01hx...",
    agent_name="reviewer",
    task_description="Review authentication implementation.",
    return_messages=True,
)

vars = memory.load_memory_variables({"input": "Is the token implementation correct?"})

# Full compiled text
print(vars["hipp0_context"])

# Individual decisions
for dec in vars["hipp0_decisions"]:
    print(f"[{dec['confidence']:.0%}] {dec['title']}")
```

### Distillation Frequency

By default, `distill_every=1` sends each exchange to the distillery immediately. For long conversations, increase this to batch:

```python
# Distil after every 5 exchanges
memory = Hipp0Memory(
    client=client,
    project_id="proj_01hx...",
    agent_name="analyst",
    task_description="Analyze requirements.",
    distill_every=5,
)
```

---

## Hipp0CallbackHandler — Automatic Capture

`Hipp0CallbackHandler` implements `BaseCallbackHandler` and can be attached to any LangChain chain, agent, or LLM. It automatically buffers LLM outputs and tool results, then flushes them to the Hipp0 distillery when the top-level chain completes.

### Constructor Parameters

```python
Hipp0CallbackHandler(
    client: Hipp0Client,
    project_id: str,
    agent_name: str,
    capture_tool_outputs: bool = True,
    capture_llm_outputs: bool = True,
    distill_on_chain_end: bool = True,
)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `client` | `Hipp0Client` | required | Initialized Hipp0 client |
| `project_id` | `str` | required | Hipp0 project ID |
| `agent_name` | `str` | required | Agent attribution for extracted decisions |
| `capture_tool_outputs` | `bool` | `True` | Include tool call results in the distillery buffer |
| `capture_llm_outputs` | `bool` | `True` | Include LLM generation text in the buffer |
| `distill_on_chain_end` | `bool` | `True` | Flush to distillery at the end of the outermost chain |

### With any Chain or Agent

Pass the handler in the `config` dict:

```python
from hipp0_sdk import Hipp0Client
from hipp0_langchain import Hipp0CallbackHandler
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

client = Hipp0Client(base_url="http://localhost:3100")

handler = Hipp0CallbackHandler(
    client=client,
    project_id="proj_01hx...",
    agent_name="code-reviewer",
)

llm = ChatOpenAI(model="gpt-4o")
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a code reviewer."),
    ("human", "{input}"),
])
chain = prompt | llm

# Attach via config
response = chain.invoke(
    {"input": "Should we use async/await or callbacks for the HTTP client?"},
    config={"callbacks": [handler]},
)

print(response.content)
# After the chain ends, the conversation is automatically sent to
# the distillery and any decisions are extracted and stored.
```

### With a LangChain Agent

```python
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from hipp0_sdk import Hipp0Client
from hipp0_langchain import Hipp0CallbackHandler

client = Hipp0Client(base_url="http://localhost:3100")
handler = Hipp0CallbackHandler(
    client=client,
    project_id="proj_01hx...",
    agent_name="research-agent",
)

llm = ChatOpenAI(model="gpt-4o", temperature=0)
tools = [...]  # your tools

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful research assistant."),
    ("placeholder", "{agent_scratchpad}"),
    ("human", "{input}"),
])

agent = create_tool_calling_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools)

result = executor.invoke(
    {"input": "Research vector database options and make a recommendation."},
    config={"callbacks": [handler]},
)

# All tool outputs and LLM responses are buffered and sent to Hipp0
print(result["output"])
```

### Controlling What Gets Captured

```python
# Only capture LLM outputs, not tool outputs
handler = Hipp0CallbackHandler(
    client=client,
    project_id="proj_01hx...",
    agent_name="analyst",
    capture_tool_outputs=False,
    capture_llm_outputs=True,
)

# Disable automatic flush — call manually
handler = Hipp0CallbackHandler(
    client=client,
    project_id="proj_01hx...",
    agent_name="analyst",
    distill_on_chain_end=False,
)

# Run chain...
result = chain.invoke(inputs, config={"callbacks": [handler]})

# Manually flush at a convenient time
handler.flush()
```

### Manual Flush

```python
# Flush accumulated buffer to the distillery
handler.flush()

# Discard buffer without sending (e.g., on error)
handler.clear()
```

---

## Hipp0Checkpointer — LangGraph State Persistence

`Hipp0Checkpointer` implements LangGraph's `BaseCheckpointSaver` interface. It stores each LangGraph checkpoint as a Hipp0 `SessionSummary` (with the full checkpoint JSON embedded in the metadata), enabling cross-session graph state persistence without any additional infrastructure.

### Constructor Parameters

```python
Hipp0Checkpointer(
    client: Hipp0Client,
    project_id: str,
    agent_name: str,
    task_description: str = "Continue the current task.",
    max_tokens: int | None = None,
)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `client` | `Hipp0Client` | required | Initialized Hipp0 client |
| `project_id` | `str` | required | Hipp0 project ID |
| `agent_name` | `str` | required | Agent name for context compilation |
| `task_description` | `str` | `"Continue the current task."` | Used for context compilation on checkpoint restore |
| `max_tokens` | `int \| None` | `None` | Token budget for context compilation |

### Basic LangGraph Integration

```python
import operator
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from hipp0_sdk import Hipp0Client
from hipp0_langchain import Hipp0Checkpointer

client = Hipp0Client(base_url="http://localhost:3100")

checkpointer = Hipp0Checkpointer(
    client=client,
    project_id="proj_01hx...",
    agent_name="orchestrator",
    task_description="Coordinate the multi-step analysis pipeline.",
)

# Define state schema
class AgentState(TypedDict):
    messages: Annotated[list, operator.add]
    decisions: list[str]  # decision IDs accumulated during the run

# Define nodes
llm = ChatOpenAI(model="gpt-4o")

def analyze_node(state: AgentState) -> dict:
    messages = state["messages"]
    response = llm.invoke(messages)
    return {"messages": [response]}

def decide_node(state: AgentState) -> dict:
    # Extract the last message and record a decision
    last_msg = state["messages"][-1].content
    # ... decision logic ...
    return {"messages": [], "decisions": state.get("decisions", [])}

# Build graph
workflow = StateGraph(AgentState)
workflow.add_node("analyze", analyze_node)
workflow.add_node("decide", decide_node)
workflow.set_entry_point("analyze")
workflow.add_edge("analyze", "decide")
workflow.add_edge("decide", END)

# Compile with Hipp0 checkpointer
app = workflow.compile(checkpointer=checkpointer)

# Each invocation with the same thread_id resumes from the last checkpoint
config = {"configurable": {"thread_id": "analysis-thread-001"}}

result = app.invoke(
    {"messages": [{"role": "user", "content": "Analyze the authentication architecture."}]},
    config=config,
)
print(result)
```

### Multi-Agent Graph with Checkpointing

```python
import operator
from typing import Annotated, Literal, TypedDict
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage
from hipp0_sdk import Hipp0Client
from hipp0_langchain import Hipp0Checkpointer, Hipp0Memory

client = Hipp0Client(base_url="http://localhost:3100")
PROJECT_ID = "proj_01hx..."

# Checkpointer for state persistence
checkpointer = Hipp0Checkpointer(
    client=client,
    project_id=PROJECT_ID,
    agent_name="orchestrator",
    task_description="Coordinate architecture design and security review.",
)

# Memory for context compilation per agent role
architect_memory = Hipp0Memory(
    client=client,
    project_id=PROJECT_ID,
    agent_name="architect",
    task_description="Design system architecture.",
)

security_memory = Hipp0Memory(
    client=client,
    project_id=PROJECT_ID,
    agent_name="security",
    task_description="Review security implications.",
)

# State
class GraphState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]
    next_agent: str
    phase: str

# Nodes
def architect_node(state: GraphState) -> dict:
    # Load Hipp0 context for the architect
    context_vars = architect_memory.load_memory_variables({"input": state["messages"][-1].content})
    hipp0_context = context_vars.get("hipp0_context", "")

    llm = ChatOpenAI(model="gpt-4o", temperature=0.1)
    system = f"You are a software architect.\n\n{hipp0_context}"
    response = llm.invoke([
        {"role": "system", "content": system},
        *state["messages"],
    ])

    # Save the exchange for distillation
    architect_memory.save_context(
        {"input": state["messages"][-1].content},
        {"output": response.content},
    )

    return {
        "messages": [response],
        "next_agent": "security",
        "phase": "security_review",
    }

def security_node(state: GraphState) -> dict:
    context_vars = security_memory.load_memory_variables({"input": state["messages"][-1].content})
    hipp0_context = context_vars.get("hipp0_context", "")

    llm = ChatOpenAI(model="gpt-4o", temperature=0.1)
    system = f"You are a security engineer.\n\n{hipp0_context}"
    response = llm.invoke([
        {"role": "system", "content": system},
        *state["messages"],
    ])

    security_memory.save_context(
        {"input": state["messages"][-1].content},
        {"output": response.content},
    )

    return {
        "messages": [response],
        "next_agent": "end",
        "phase": "complete",
    }

def route(state: GraphState) -> Literal["architect", "security", "__end__"]:
    next_agent = state.get("next_agent", "architect")
    if next_agent == "end":
        return END
    return next_agent

# Build graph
workflow = StateGraph(GraphState)
workflow.add_node("architect", architect_node)
workflow.add_node("security", security_node)
workflow.set_entry_point("architect")
workflow.add_conditional_edges("architect", route)
workflow.add_conditional_edges("security", route)

# Compile with checkpointer
app = workflow.compile(checkpointer=checkpointer)

# Run with thread ID for checkpointing
config = {"configurable": {"thread_id": "auth-design-thread"}}
initial_state = {
    "messages": [HumanMessage(content="Design JWT authentication for the API.")],
    "next_agent": "architect",
    "phase": "design",
}

result = app.invoke(initial_state, config=config)
for msg in result["messages"]:
    print(f"[{msg.type}]: {msg.content[:200]}")
```

### Resuming from a Checkpoint

Because checkpoints are stored in Hipp0, they persist across process restarts:

```python
from hipp0_sdk import Hipp0Client
from hipp0_langchain import Hipp0Checkpointer

client = Hipp0Client(base_url="http://localhost:3100")
checkpointer = Hipp0Checkpointer(
    client=client,
    project_id="proj_01hx...",
    agent_name="orchestrator",
)

# Compile the same graph
app = workflow.compile(checkpointer=checkpointer)

# Resume with the same thread_id — the checkpointer retrieves the last state
config = {"configurable": {"thread_id": "auth-design-thread"}}

# Continue from where it left off
result = app.invoke(
    {"messages": [HumanMessage(content="Also consider OAuth2 support.")]},
    config=config,
)
```

### How Checkpoints Are Stored

Each `put()` call creates a Hipp0 `SessionSummary` with:
- `summary`: Human-readable description (`"LangGraph checkpoint for thread 'X'"`)
- `metadata.thread_id`: The LangGraph thread ID
- `metadata.checkpoint_id`: The checkpoint's unique ID
- `metadata.tags`: `["langgraph-checkpoint"]` (used to filter from regular sessions)
- `metadata.checkpoint_payload`: Full checkpoint JSON (serialized with `json.dumps(..., default=str)`)
- `metadata.langgraph_metadata`: The LangGraph checkpoint metadata dict

On `get_tuple()`, the checkpointer queries session summaries filtered by `thread_id` and the `langgraph-checkpoint` tag, takes the most recent, and deserializes the checkpoint payload.

---

## Complete Example: Research Agent

A complete LangChain agent that combines memory, callback, and Hipp0 decisions:

```python
import os
from hipp0_sdk import Hipp0Client
from hipp0_langchain import Hipp0Memory, Hipp0CallbackHandler
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool

client = Hipp0Client(base_url=os.environ["HIPP0_API_URL"])
PROJECT_ID = os.environ["HIPP0_PROJECT_ID"]

# Memory loads relevant context before each LLM call
memory = Hipp0Memory(
    client=client,
    project_id=PROJECT_ID,
    agent_name="researcher",
    task_description="Research and evaluate database technology options.",
    max_tokens=6000,
    distill_every=2,  # Distil after every 2 exchanges
)

# Callback captures all outputs for automatic extraction
callback = Hipp0CallbackHandler(
    client=client,
    project_id=PROJECT_ID,
    agent_name="researcher",
)

@tool
def search_documentation(query: str) -> str:
    """Search technical documentation for information."""
    # In production, this would call a real search API
    return f"Documentation results for '{query}': [simulated results]"

@tool
def benchmark_database(db_name: str) -> str:
    """Run benchmarks for a specified database."""
    return f"Benchmark results for {db_name}: [simulated benchmark data]"

llm = ChatOpenAI(model="gpt-4o", temperature=0.1)
tools = [search_documentation, benchmark_database]

prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a database research specialist.

HIPP0 CONTEXT (existing project decisions):
{hipp0_context}

When you make a recommendation, state it clearly as a decision with:
- What was decided
- Why (rationale)
- What alternatives were rejected and why"""),
    ("placeholder", "{agent_scratchpad}"),
    ("human", "{input}"),
])

agent = create_tool_calling_agent(llm, tools, prompt)
executor = AgentExecutor(
    agent=agent,
    tools=tools,
    memory=memory,
    verbose=True,
)

# Run the agent
result = executor.invoke(
    {"input": "Compare pgvector, Pinecone, and Weaviate for our use case. We need 1536-dim embeddings, cosine similarity, and cost under $200/month."},
    config={"callbacks": [callback]},
)

print(result["output"])
print("\nDecisions extracted and stored in Hipp0 for future agent context.")
```

---

## Complete Example: Multi-Agent LangGraph

A production-ready multi-agent graph with full Hipp0 integration:

```python
import os
import operator
from typing import Annotated, Literal, TypedDict
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from hipp0_sdk import Hipp0Client
from hipp0_langchain import Hipp0Checkpointer, Hipp0CallbackHandler

client = Hipp0Client(base_url=os.environ["HIPP0_API_URL"])
PROJECT_ID = os.environ["HIPP0_PROJECT_ID"]

checkpointer = Hipp0Checkpointer(
    client=client,
    project_id=PROJECT_ID,
    agent_name="orchestrator",
    task_description="Coordinate a multi-agent architecture review pipeline.",
)

# Shared callback for all nodes
hipp0_callback = Hipp0CallbackHandler(
    client=client,
    project_id=PROJECT_ID,
    agent_name="pipeline",
    distill_on_chain_end=False,  # We flush manually at the end
)

class PipelineState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]
    current_agent: str
    iteration: int

llm = ChatOpenAI(model="gpt-4o", temperature=0.1)

def make_agent_node(role: str, system_prompt: str):
    """Factory for agent nodes with Hipp0 context injection."""
    def node(state: PipelineState) -> dict:
        # Compile Hipp0 context for this role
        ctx = client.compile_context(
            project_id=PROJECT_ID,
            agent_name=role,
            task_description=state["messages"][-1].content if state["messages"] else "",
            max_tokens=4096,
        )
        hipp0_context = ctx.get("compiled_text", "")

        full_system = f"{system_prompt}\n\n{hipp0_context}" if hipp0_context else system_prompt
        messages = [{"role": "system", "content": full_system}] + [
            {"role": m.type, "content": m.content}
            for m in state["messages"]
        ]

        response = llm.invoke(
            messages,
            config={"callbacks": [hipp0_callback]},
        )
        return {"messages": [response], "current_agent": role}

    return node

architect_node = make_agent_node(
    "architect",
    "You are a software architect. Analyze requirements and design solutions.",
)

reviewer_node = make_agent_node(
    "reviewer",
    "You are a technical reviewer. Review the architect's proposal for gaps and risks.",
)

def should_continue(state: PipelineState) -> Literal["reviewer", "__end__"]:
    iteration = state.get("iteration", 0) + 1
    if iteration >= 2:
        return END
    return "reviewer"

# Build graph
workflow = StateGraph(PipelineState)
workflow.add_node("architect", architect_node)
workflow.add_node("reviewer", reviewer_node)
workflow.set_entry_point("architect")
workflow.add_conditional_edges("architect", should_continue)
workflow.add_edge("reviewer", "architect")

app = workflow.compile(checkpointer=checkpointer)

# Run
config = {"configurable": {"thread_id": "arch-review-session-001"}}
result = app.invoke(
    {
        "messages": [HumanMessage(content="Design a multi-tenant auth system.")],
        "current_agent": "architect",
        "iteration": 0,
    },
    config=config,
)

# Flush any remaining captures to the distillery
hipp0_callback.flush()

print("Pipeline complete. All decisions captured in Hipp0.")
```

---

## Configuration Reference

### Hipp0Client

```python
Hipp0Client(
    base_url="http://localhost:3100",
    api_key=None,       # optional API key
    timeout=30,         # seconds
)
```

### Environment Variables

```bash
HIPP0_API_URL=http://localhost:3100
HIPP0_PROJECT_ID=proj_01hx...
HIPP0_API_KEY=nxk_...    # optional
```

---

## Best Practices

**Use `Hipp0Memory` for interactive chains, `Hipp0CallbackHandler` for agents.** Memory is better for chains where you control the prompt template (inject `{hipp0_context}`). Callbacks are better for agents where you cannot modify the prompt.

**Set `task_description` precisely.** The more specific the task description, the better Hipp0 can rank relevant decisions. "Implement JWT authentication for the payments service" outperforms "implement authentication".

**Align `agent_name` with Hipp0 role templates.** Using names like `"architect"`, `"security"`, `"reviewer"` automatically activates role-based weighting in the 5-signal scoring algorithm.

**Use thread IDs consistently for LangGraph.** The checkpointer stores state by `thread_id`. Use stable, meaningful thread IDs like `"project-auth-design"` rather than random UUIDs, so you can resume the same conversation across sessions.

**For long-running graphs, set `distill_on_chain_end=False` and flush manually.** This gives you control over when decisions are extracted and avoids mid-graph API calls.

**Avoid creating multiple `Hipp0Memory` instances with the same `agent_name` in the same process.** Each instance maintains its own distillation buffer. Two instances will produce duplicate distillery calls.

---

## Troubleshooting

### `hipp0_context` key not found in chain inputs

Ensure your prompt template includes `{hipp0_context}` and the `memory_key` matches:

```python
memory = Hipp0Memory(..., memory_key="hipp0_context")

prompt = ChatPromptTemplate.from_messages([
    ("system", "Context: {hipp0_context}"),  # must match memory_key
    ("human", "{input}"),
])
```

### Checkpointer returns `None` for an existing thread

Check that sessions with the `langgraph-checkpoint` tag exist in Hipp0:

```bash
curl "http://localhost:3100/api/projects/proj_01hx.../sessions" \
  | jq '[.[] | select(.metadata.tags[]? == "langgraph-checkpoint")]'
```

If the sessions exist but the checkpointer still returns `None`, verify the `thread_id` matches exactly.

### `ImportError: cannot import name 'BaseCheckpointSaver' from 'langgraph'`

The LangGraph checkpoint API was reorganized in v0.2. Upgrade:

```bash
pip install --upgrade langgraph
```

If you are on langgraph 0.1.x, the checkpointer imports from `langgraph.checkpoint`:

```python
# The Hipp0Checkpointer handles both versions gracefully
# If you see import errors, ensure langgraph >= 0.2.0
```

### High latency on `load_memory_variables`

Context compilation is typically 100–300ms. If it is slower:

1. Check the Hipp0 server logs for slow queries
2. Reduce `max_tokens` to limit the scope of compilation
3. Verify the HNSW index exists: `\d decisions` in psql should show an index on `embedding`
4. Consider caching: the same `(agent_name, task_description)` pair is cached for 1 hour

### Distillery not running after `save_context`

Check if `distill_every` is set to a value greater than the number of exchanges that have occurred:

```python
# Check current exchange count
count = object.__getattribute__(memory, "_exchange_count")
print(f"Exchange count: {count}, distill_every: {memory.distill_every}")
```

Force a flush:

```python
memory._flush_to_distillery()
```
