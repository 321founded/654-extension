# Changements SDK et Timeout Analysis

## 1. Changements nécessaires au niveau du SDK Backend

### Architecture actuelle (Synchrone - Bloquée)
```python
# backend/api.py - Approche actuelle
@app.patch("/api/me")
async def update_session(cookies):
    # Traitement synchrone
    validate_cookies(cookies)
    return {"success": True}
```

**Problème :** Pas de moyen pour l'agent de poser des questions à l'utilisateur.

---

### Architecture nécessaire (Asynchrone - Avec tâches)

```python
# backend/api.py - Nouvelle approche
from claude_agent_sdk import ClaudeAgent
from task_queue import TaskQueue

task_queue = TaskQueue()

@app.patch("/api/me")
async def update_session(cookies):
    # L'agent traite les cookies
    agent = ClaudeAgent()

    # Si l'agent a besoin d'une confirmation
    if needs_user_confirmation():
        task_id = task_queue.create_task({
            "user_id": user.id,
            "type": "ASK_QUESTION",
            "question": "Confirmez-vous ces informations LinkedIn ?",
            "options": ["Oui", "Non", "Annuler"],
            "created_at": datetime.now()
        })

        # Retourne immédiatement avec task_id
        return {
            "success": True,
            "pending_task": task_id,
            "message": "Confirmation requise"
        }

    # Traitement normal si pas besoin de confirmation
    return {"success": True}

@app.get("/api/agent/tasks")
async def get_pending_tasks(user_id: str):
    """L'extension poll ce endpoint pour récupérer les tâches en attente"""
    tasks = task_queue.get_pending_tasks(user_id)
    return {"tasks": tasks}

@app.post("/api/agent/tasks/{task_id}/result")
async def submit_task_result(task_id: str, result: dict):
    """L'extension soumet la réponse de l'utilisateur"""
    task = task_queue.get_task(task_id)

    # L'agent reprend avec la réponse utilisateur
    agent = ClaudeAgent()
    agent.resume_from_checkpoint(
        task.checkpoint_id,
        user_input=result["answer"]
    )

    # Marque la tâche comme complétée
    task_queue.complete_task(task_id)

    return {"success": True}

@app.websocket("/api/agent/stream")
async def websocket_stream(websocket: WebSocket):
    """Alternative : Push en temps réel via WebSocket"""
    await websocket.accept()

    async for task in task_queue.subscribe(user_id):
        await websocket.send_json(task)
```

---

## 2. Le cloud agent peut-il rester "ON" pour attendre ?

### ❌ NON - Limitations de timeout

D'après la recherche sur la documentation Claude 2025 :

| Composant | Timeout Maximum | Configurable ? |
|-----------|----------------|----------------|
| **Claude Messages API (non-streaming)** | **10 minutes** | Non |
| **Claude Code (défaut)** | **2 minutes** | Oui (max 120 min) |
| **Bash Tool dans SDK** | **10 minutes** | Oui (max) |
| **AWS Bedrock Claude** | **60 minutes** | Oui (client SDK) |
| **Message Batches API** | **24 heures** | Non (processing batch) |
| **SDK Initialization** | **60 secondes** | Non |

### Configuration possible (Claude Code)

```json
// ~/.claude/settings.json
{
  "env": {
    "BASH_DEFAULT_TIMEOUT_MS": 1800000,  // 30 minutes
    "BASH_MAX_TIMEOUT_MS": 7200000       // 120 minutes (2 heures MAX)
  }
}
```

**Mais cela ne résout PAS le problème fondamental.**

---

## 3. Pourquoi les timeouts sont un problème fatal

### Scénario réel :

```
09:00 - Utilisateur démarre workflow
09:01 - Backend démarre agent Claude
09:02 - Agent a besoin de confirmation utilisateur
09:02 - Agent attend... (requête HTTP active)
09:12 - TIMEOUT après 10 minutes ❌
        L'utilisateur n'a pas encore vu la question !
```

### L'utilisateur peut ne pas être disponible :
- En réunion (1-2 heures)
- Au déjeuner (1 heure)
- Hors ligne (plusieurs heures/jours)
- Dans un autre fuseau horaire

**Garder une connexion HTTP active pendant des heures est impossible.**

---

## 4. Solution : Architecture Asynchrone avec Task Queue

### ✅ Flux asynchrone recommandé

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: Agent a besoin d'une réponse                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  09:00  Extension → Backend: "Voici les cookies LinkedIn"      │
│  09:01  Backend → Agent: Démarre traitement                    │
│  09:02  Agent: "J'ai besoin de confirmer avec l'utilisateur"   │
│  09:02  Agent → Task Queue: Crée tâche "ASK_CONFIRMATION"      │
│  09:02  Agent: Sauvegarde checkpoint, se met en pause          │
│  09:02  Backend → Extension: {success: true, task_id: "xyz"}   │
│                                                                 │
│  ⏱️  REQUÊTE SE TERMINE - Pas de timeout !                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: Extension récupère la tâche (polling ou WebSocket)   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  09:03  Extension poll: GET /api/agent/tasks                   │
│  09:03  Backend: {tasks: [{id: "xyz", question: "..."}]}       │
│  09:03  Extension: Affiche modal avec question                 │
│                                                                 │
│  ... Utilisateur peut prendre des HEURES pour répondre ...     │
│                                                                 │
│  14:30  Utilisateur clique "Oui"                               │
│  14:30  Extension → Backend: POST /api/agent/tasks/xyz/result  │
│         Body: {answer: "Oui"}                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: Agent reprend l'exécution                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  14:30  Backend reçoit réponse "Oui"                           │
│  14:30  Backend → Agent: Reprend depuis checkpoint             │
│  14:30  Agent: Continue traitement avec réponse utilisateur    │
│  14:31  Agent: Terminé avec succès                             │
│  14:31  Backend → Extension: {success: true}                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Avantages :
✅ **Pas de timeout** - Chaque requête se termine rapidement
✅ **Attente infinie** - L'utilisateur peut répondre quand il veut
✅ **Scalable** - Le backend ne garde pas de connexions ouvertes
✅ **Résilience** - Si le serveur redémarre, les tâches persistent en DB
✅ **Multi-utilisateurs** - Chaque utilisateur a sa propre file de tâches

---

## 5. Implémentation Backend avec Claude Agent SDK

### Task Queue System (Backend)

```python
# backend/task_queue.py
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List
import uuid

@dataclass
class Task:
    id: str
    user_id: str
    type: str  # "ASK_QUESTION", "CONFIRM_ACTION", "ENTER_DATA"
    question: str
    options: List[str]
    checkpoint_id: str  # Pour reprendre l'agent
    created_at: datetime
    status: str  # "pending", "completed", "cancelled"
    result: Optional[dict] = None

class TaskQueue:
    def __init__(self):
        # En production, utiliser Redis ou PostgreSQL
        self.tasks = {}

    def create_task(self, user_id: str, task_data: dict, checkpoint_id: str) -> str:
        task_id = str(uuid.uuid4())
        task = Task(
            id=task_id,
            user_id=user_id,
            checkpoint_id=checkpoint_id,
            status="pending",
            created_at=datetime.now(),
            **task_data
        )
        self.tasks[task_id] = task
        return task_id

    def get_pending_tasks(self, user_id: str) -> List[Task]:
        return [
            task for task in self.tasks.values()
            if task.user_id == user_id and task.status == "pending"
        ]

    def complete_task(self, task_id: str, result: dict):
        if task_id in self.tasks:
            self.tasks[task_id].status = "completed"
            self.tasks[task_id].result = result

    def get_task(self, task_id: str) -> Optional[Task]:
        return self.tasks.get(task_id)
```

### Agent avec Checkpoints

```python
# backend/agent_manager.py
from claude_agent_sdk import ClaudeAgent

class AgentManager:
    def __init__(self, task_queue: TaskQueue):
        self.task_queue = task_queue
        self.checkpoints = {}

    async def process_with_user_interaction(self, user_id: str, data: dict):
        agent = ClaudeAgent()

        # L'agent traite les données
        result = await agent.run(data)

        # Si l'agent a besoin d'une interaction utilisateur
        if result.needs_user_input:
            # Sauvegarde l'état actuel
            checkpoint_id = self.save_checkpoint(agent.state)

            # Crée une tâche pour l'utilisateur
            task_id = self.task_queue.create_task(
                user_id=user_id,
                task_data={
                    "type": "ASK_QUESTION",
                    "question": result.user_prompt,
                    "options": result.options
                },
                checkpoint_id=checkpoint_id
            )

            # Retourne immédiatement (pas de timeout)
            return {
                "status": "pending_user_input",
                "task_id": task_id
            }

        # Traitement normal si pas d'interaction nécessaire
        return {
            "status": "completed",
            "result": result.data
        }

    async def resume_from_task(self, task_id: str, user_response: dict):
        task = self.task_queue.get_task(task_id)

        # Restaure l'état de l'agent
        agent_state = self.load_checkpoint(task.checkpoint_id)
        agent = ClaudeAgent.from_state(agent_state)

        # Continue avec la réponse utilisateur
        result = await agent.resume(user_input=user_response)

        # Marque la tâche comme complétée
        self.task_queue.complete_task(task_id, user_response)

        return result

    def save_checkpoint(self, agent_state) -> str:
        checkpoint_id = str(uuid.uuid4())
        self.checkpoints[checkpoint_id] = agent_state
        return checkpoint_id

    def load_checkpoint(self, checkpoint_id: str):
        return self.checkpoints.get(checkpoint_id)
```

---

## 6. Changements Extension Chrome

### Polling pour récupérer les tâches

```javascript
// api_client.js - Ajouter ces fonctions

/**
 * Récupère les tâches en attente pour l'utilisateur
 */
async function getPendingTasks() {
  const token = await getAuthToken();
  const response = await fetch('https://654.321founded.com/api/agent/tasks', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.json();  // {tasks: [{id, type, question, ...}]}
}

/**
 * Soumet la réponse utilisateur pour une tâche
 */
async function submitTaskResult(taskId, result) {
  const token = await getAuthToken();
  const response = await fetch(
    `https://654.321founded.com/api/agent/tasks/${taskId}/result`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ result })
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.json();
}
```

### Polling dans content.js

```javascript
// content.js - Modifier la fonction de polling

function startPeriodicCheck() {
  checkInterval = setInterval(async () => {
    try {
      // 1. Vérifier l'état de session (comme avant)
      const status = await chrome.runtime.sendMessage({
        action: 'checkSessionStatus'
      });

      // 2. NOUVEAU : Vérifier les tâches en attente
      const tasks = await chrome.runtime.sendMessage({
        action: 'getPendingTasks'
      });

      if (tasks && tasks.length > 0) {
        // Afficher la première tâche
        showTaskModal(tasks[0]);
      } else if (!status.valid) {
        // Afficher le modal de mise à jour (comportement actuel)
        showOverlay();
      }
    } catch (error) {
      console.error('Periodic check failed:', error);
    }
  }, 5 * 60 * 1000);  // 5 minutes au lieu de 15 (plus réactif)
}

/**
 * Affiche un modal dynamique pour une tâche
 */
function showTaskModal(task) {
  const overlay = createOverlay();

  // Rendu dynamique basé sur le type de tâche
  overlay.innerHTML = `
    <div class="ext654-modal">
      <div class="ext654-modal-header">
        <h2>${task.title || '654 - Action requise'}</h2>
      </div>
      <div class="ext654-modal-body">
        <p>${task.question}</p>
      </div>
      <div class="ext654-modal-footer">
        ${task.options.map((option, index) => `
          <button class="ext654-task-button" data-option="${option}" data-task-id="${task.id}">
            ${option}
          </button>
        `).join('')}
      </div>
    </div>
  `;

  // Attacher les événements aux boutons
  overlay.querySelectorAll('.ext654-task-button').forEach(button => {
    button.addEventListener('click', async (e) => {
      const option = e.target.dataset.option;
      const taskId = e.target.dataset.taskId;

      // Soumettre la réponse
      await chrome.runtime.sendMessage({
        action: 'submitTaskResult',
        taskId: taskId,
        result: { answer: option }
      });

      // Masquer le modal
      hideOverlay();
    });
  });

  document.body.appendChild(overlay);
}
```

---

## 7. Résumé : Combien de temps l'agent peut-il attendre ?

### Limites techniques :
- **Claude API synchrone :** Maximum 10 minutes
- **Claude Code (configurable) :** Maximum 2 heures
- **Message Batches API :** Maximum 24 heures

### ✅ Solution asynchrone :
- **Attente infinie** - L'utilisateur peut répondre quand il veut
- **Pas de timeout HTTP** - Chaque requête se termine rapidement
- **Persistance** - Les tâches sont stockées en base de données
- **Scalabilité** - Pas de connexions actives maintenues

### Recommandation :

```
NE PAS essayer de garder l'agent "ON" pour attendre
→ Utiliser un système de tâches asynchrones avec checkpoints

Flux :
1. Agent démarre → pose question → sauvegarde état → se termine
2. Tâche stockée en DB (peut attendre des jours)
3. Utilisateur répond (quand il veut)
4. Agent reprend depuis le checkpoint → continue traitement
```

### Durées d'attente réalistes :

| Scénario | Durée d'attente | Faisable ? |
|----------|----------------|------------|
| Utilisateur actif en ligne | Quelques secondes | ✅ Polling |
| Utilisateur en réunion | 1-2 heures | ✅ Task queue |
| Utilisateur hors ligne | Plusieurs heures | ✅ Task queue |
| Utilisateur en weekend | 2-3 jours | ✅ Task queue + DB |
| Workflow multi-étapes | Plusieurs jours | ✅ Task queue + DB |

---

## 8. Architecture finale recommandée

```
┌───────────────────────────────────────────────────────────────────┐
│                        BACKEND (Cloud)                            │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Claude Agent SDK                                                 │
│  ├─ Process data                                                  │
│  ├─ Need user input? → Save checkpoint → Create task → Pause     │
│  └─ Resume from checkpoint when answer received                   │
│                                                                   │
│  Task Queue (Redis/PostgreSQL)                                    │
│  ├─ Store pending tasks with checkpoints                          │
│  ├─ GET /api/agent/tasks → Return pending tasks                  │
│  └─ POST /api/agent/tasks/{id}/result → Resume agent             │
│                                                                   │
│  WebSocket (Optional)                                             │
│  └─ /api/agent/stream → Push tasks in real-time                  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
                              ↕
┌───────────────────────────────────────────────────────────────────┐
│                    EXTENSION (Chrome)                             │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Polling (5 min interval)                                         │
│  └─ GET /api/agent/tasks → Fetch pending tasks                   │
│                                                                   │
│  Dynamic UI Renderer                                              │
│  └─ Render modal based on task type (question, form, etc.)       │
│                                                                   │
│  Result Submission                                                │
│  └─ POST /api/agent/tasks/{id}/result → Submit user answer       │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## Conclusion

**Q: Le cloud agent peut-il rester "ON" pour attendre ?**
**R: NON** - Maximum 10 minutes (API) ou 2 heures (Claude Code configuré)

**Q: Comment gérer l'attente des réponses utilisateur ?**
**R: Système de tâches asynchrones** avec checkpoints :
- Agent se met en pause après avoir créé une tâche
- Tâche stockée en DB (attente infinie)
- Utilisateur répond quand il veut
- Agent reprend depuis le checkpoint

**Effort d'implémentation :**
- Backend : 2-3 jours (task queue + checkpoints)
- Extension : 1-2 jours (polling + UI dynamique)
- **Total : 3-5 jours**
