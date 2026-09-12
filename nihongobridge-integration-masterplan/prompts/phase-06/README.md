# Phase 06 — AI Integration Prompts

## Objective
Integrate AI tutor functionality connected to the platform's knowledge and learning infrastructure.

## Prerequisites
- Phase 03 complete (search & retrieval)
- Knowledge data available
- Search infrastructure operational

## Prompt Sequence

### Prompt 06-01: AI Architecture
```
Design the AI integration architecture.
Define: RAG pipeline, knowledge retrieval strategy,
context construction, prompt engineering patterns,
cost management, rate limiting.
Review existing AI code in both repositories.
The AI MUST use platform knowledge — not be an isolated chatbot.
```

### Prompt 06-02: RAG Pipeline
```
Implement the RAG (Retrieval-Augmented Generation) pipeline.
Embed and index: dictionary entries, grammar points, example sentences.
Implement retrieval: given a user query, find relevant knowledge.
Construct context from retrieved knowledge for AI prompts.
```

### Prompt 06-03: AI Tutor Chat
```
Implement the AI tutor chat interface.
Support: grammar questions, vocabulary questions, general Japanese questions.
Use RAG to ground responses in platform knowledge.
Include user's learning progress in context where relevant.
Build conversation UI.
```

### Prompt 06-04: Specialized AI Features
```
Implement specialized AI features:
- Grammar explanation (given a grammar point, explain with examples)
- Vocabulary explanation (given a word, explain usage)
- Translation assistance
- Correction engine (correct user's Japanese text)
- Conversation practice
```

### Prompt 06-05: AI Cost & Safety
```
Implement AI cost controls and safety measures.
Rate limiting per user, token budgets, response caching,
content filtering, error handling for API failures.
Monitor token usage and costs.
```

## Deliverables Checklist
- [ ] AI architecture document
- [ ] RAG pipeline implementation
- [ ] Knowledge embedding/indexing
- [ ] AI tutor chat
- [ ] Grammar explanations
- [ ] Vocabulary explanations
- [ ] Translation assistance
- [ ] Correction engine
- [ ] Cost controls
- [ ] AI API endpoints
- [ ] AI tests
