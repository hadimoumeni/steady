# Steady

**Glucose simulation and decision support for parents of Type 1 diabetic children.**

Steady takes a natural language description of a child's current situation — glucose reading, recent meal, insulin taken, planned activity — runs a real physiological simulation, and returns a plain English action plan. Built for the Cursor AI Hackathon at IE University, March 2026.

---

## The Problem

Tom's daughter Lena has Type 1 diabetes. Every day before she plays sport he faces the same dangerous decision — is it safe? Her CGM shows him a number. Nothing tells him what to do with it. Every existing tool uses a static decision tree. Steady runs a real dynamic simulation personalized to Lena's clinical profile.

---

## How It Works

```
Parent types one sentence
        ↓
Claude extracts structured medical parameters (NLP)
        ↓
Bergman Minimal Model — 3 coupled ODEs (scipy)
        ↓
+ Meal absorption layer (Dalla Man, GI-tuned)
+ IOB pharmacokinetic decay (insulin-type specific)
+ Exercise perturbation (aerobic / mixed / anaerobic)
        ↓
Monte Carlo × 200 runs → confidence bands
        ↓
Claude translates math → plain English action plan
        ↓
Two-panel UI: glucose curve + action timeline
```

---

## Repository Structure

```
steady/
├── backend/                        # FastAPI + Python
│   ├── main.py                     # App entry, CORS, route registration, /demo, /health, /ready
│   ├── model/
│   │   ├── bergman.py              # Bergman Minimal Model — 3 coupled ODEs
│   │   ├── iob.py                  # IOB pharmacokinetic decay by insulin type
│   │   ├── meal_absorption.py      # Dalla Man carb absorption (fast/medium/slow GI)
│   │   ├── exercise.py             # Exercise perturbation (aerobic/mixed/anaerobic)
│   │   └── monte_carlo.py          # 200-run Monte Carlo → confidence bands
│   ├── routes/
│   │   ├── extract.py              # POST /extract — NL text → structured params
│   │   ├── simulate.py             # POST /simulate — params → glucose trajectory
│   │   ├── advise.py               # POST /advise + POST /advise/stream (SSE)
│   │   └── nightscout.py           # GET /nightscout/current — CGM proxy
│   ├── prompts/
│   │   ├── extraction_prompt.txt   # System prompt for NLP parameter extraction
│   │   └── advice_prompt.txt       # System prompt for plain English conclusion
│   ├── tests/
│   │   └── test_extract_inference.py
│   ├── Dockerfile
│   ├── railway.toml
│   ├── requirements.txt
│   ├── test_simulate.py
│   └── .env.example
│
├── web/                            # Next.js 14 + TypeScript (primary UI)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── SteadyApp.tsx           # Root component — state, API orchestration
│   │   ├── ScenarioForm.tsx        # NL input, preset buttons, profile toggle
│   │   ├── ManualScenarioForm.tsx  # Manual numeric input (no AI required)
│   │   ├── GlucoseChart.tsx        # Recharts curve + p10/p90 confidence bands
│   │   ├── AdviceColumn.tsx        # Severity signal, timeline, treatment, conclusion
│   │   └── SteadyErrorBoundary.tsx # Error boundary wrapper
│   ├── hooks/
│   │   └── useSpeechRecognition.ts # Browser Speech Recognition API hook
│   ├── lib/
│   │   ├── api.ts                  # Fetch functions for all backend endpoints
│   │   ├── sse.ts                  # SSE parser for /advise/stream
│   │   ├── types.ts                # Shared TypeScript interfaces
│   │   ├── offlineExtract.ts       # Regex fallback if Claude is unavailable
│   │   └── manualDefaults.ts       # Default values for manual input mode
│   ├── .env.example
│   └── package.json
│
└── README.md
```

---

## Backend

### Environment Variables

```bash
# backend/.env
ANTHROPIC_API_KEY=your_key_here
```

### Run Locally

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/ready` | Verify environment variables configured |
| `GET` | `/demo` | Cached demo response — no API calls |
| `POST` | `/extract` | NL text → structured scenario params |
| `POST` | `/simulate` | Params → glucose trajectory + risk metrics |
| `POST` | `/advise` | Trajectory → structured action plan |
| `POST` | `/advise/stream` | Same as `/advise` with SSE streaming conclusion |
| `GET` | `/nightscout/current` | Live CGM reading via Nightscout proxy |

### POST /simulate — Request

```json
{
  "glucose": 6.8,
  "carbs_g": 30,
  "gi_category": "medium",
  "mins_since_meal": 0,
  "insulin_units": 2.0,
  "insulin_type": "novorapid",
  "mins_since_insulin": 90,
  "activity_type": "mixed",
  "activity_duration_mins": 60,
  "intensity": 1.0,
  "profile": {
    "isf": 2.8,
    "icr": 15,
    "ait_hours": 3.5,
    "weight_kg": 28
  }
}
```

### POST /simulate — Response

```json
{
  "times": [0, 5, 10, "...120"],
  "median": ["25 floats"],
  "p10": ["25 floats"],
  "p90": ["25 floats"],
  "iob_units": 0.82,
  "min_median": 3.8,
  "min_p10": 2.9,
  "danger_probability": 0.68,
  "danger_entry_minutes": 47,
  "late_hypo_risk": true,
  "activity_type": "mixed",
  "confidence_score": 5,
  "insulin_inferred": false,
  "insulin_inferred_units": null
}
```

### POST /advise — Response

```json
{
  "severity": "caution",
  "severity_label": "Give carbs before she goes",
  "immediate_step": "Give 15g fast-acting carbs before she leaves",
  "treatment_options": ["..."],
  "timeline": ["..."],
  "recheck_minutes": 15,
  "backup_step": "...",
  "escalation": "...",
  "ispad_note": "Consistent with ISPAD 2022: ...",
  "disclaimer": "Steady is decision support, not medical advice.",
  "late_hypo_warning": "...",
  "conclusion": "streamed or returned as string"
}
```

---

## The Simulation Engine

**Bergman Minimal Model** — three coupled ODEs solved with `scipy.integrate.solve_ivp` (RK45):

```
dG/dt = -p1*(G - Gb) - X*G + meal_rate(t) - exercise_uptake(t)
dX/dt = -p2*X + p3*(I - Ib)
dI/dt = -n*(I - Ib) + γ*max(0, G - Gth) + iob_rate(t)
```

Where `p3 = 0.000013 * (isf / 2.8)` — scales with the patient's insulin sensitivity factor, making the model genuinely personalized.

**IOB Pharmacokinetics** — bilinear activity curve specific to each insulin type:

| Insulin | Onset | Peak | Duration |
|---------|-------|------|----------|
| NovoRapid | 15 min | 90 min | 4 hr |
| Humalog | 15 min | 75 min | 4 hr |
| Fiasp | 5 min | 60 min | 3.5 hr |
| Apidra | 15 min | 60 min | 3.5 hr |

**Meal Absorption** — GI-tuned Gaussian appearance rate:

| Category | Peak | Examples |
|----------|------|---------|
| Fast | 20 min | Glucose tablets, juice, white bread |
| Medium | 45 min | Banana, oats, rice |
| Slow | 70 min | Pasta, lentils, wholegrains |

**Exercise Perturbation** — three physiological mechanisms:

- **Aerobic**: steady glucose uptake throughout activity window
- **Mixed** (football): adrenaline-driven glucose rise in first 15 min, then aerobic decline
- **Anaerobic**: glucose rise throughout from cortisol/adrenaline

**Monte Carlo** — 200 runs with perturbed parameters (glucose ±4%, carbs ±15%, ISF ±10%) → p10/p90 confidence bands + danger probability.

### ICR Inference

If the parent does not mention insulin units, the system infers them from the carb-to-insulin ratio:

```python
if insulin_units == 0 and carbs_g > 0:
    insulin_units = round(carbs_g / profile.icr, 1)
    insulin_inferred = True
```

The frontend surfaces this as: *"Insulin dose estimated from carb ratio."*

---

## Frontend

### Environment Variables

```bash
# web/.env.local
NEXT_PUBLIC_STEADY_API_URL=https://your-railway-url.railway.app
```

### Run Locally

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`

### Architecture

The frontend is a single-page Next.js 14 app. `SteadyApp.tsx` orchestrates the full pipeline:

1. Parent types a scenario or picks a preset (Football, Birthday, Swimming, High Start, Rest Day)
2. `/extract` parses text into structured params via Claude
3. `/simulate` returns a 2-hour glucose trajectory
4. `/advise/stream` returns severity, action plan, and a streamed plain-English conclusion
5. `GlucoseChart` renders the median prediction with p10/p90 uncertainty bands
6. `AdviceColumn` renders severity signal, treatment options, timeline, and ISPAD reference

If Claude is unavailable (missing API key), `offlineExtract.ts` provides a regex-based fallback so the prototype still works.

---

## Deployment

### Backend — Railway

1. Push to GitHub
2. Connect repo to [Railway](https://railway.app), set root directory to `backend/`
3. Set environment variable: `ANTHROPIC_API_KEY`
4. Railway uses `railway.toml` + `Dockerfile` — binds to `$PORT` automatically
5. Verify: `curl https://[your-url].railway.app/health`

### Frontend — Vercel

1. Push to GitHub
2. Connect repo to [Vercel](https://vercel.com), set root directory to `web/`
3. Set environment variable: `NEXT_PUBLIC_STEADY_API_URL=https://[your-railway-url].railway.app`
4. Vercel deploys automatically on push

---

## Medical Disclaimer

Steady is decision support, not a medical device. It does not deliver insulin, does not connect to hardware, and does not replace clinical judgment. Recommendations are aligned with ISPAD 2022 exercise guidelines for pediatric Type 1 diabetes. Always follow your diabetes team's specific guidance.

The Bergman Minimal Model is published biomedical literature (Bergman et al., 1979). Monte Carlo uncertainty quantification provides honest confidence ranges rather than false precision.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Recharts, Tailwind CSS |
| Backend | FastAPI, Python 3.11 |
| ODE Solver | scipy.integrate.solve_ivp (RK45) |
| Uncertainty | NumPy Monte Carlo (n=200) |
| NLP Extraction | Anthropic Claude (claude-opus-4-5) |
| Advice Generation | Anthropic Claude (claude-sonnet-4-20250514) via SSE |
| Frontend Deploy | Vercel |
| Backend Deploy | Railway |

---

## References

- Bergman RN et al. (1979). Quantitative estimation of insulin sensitivity. *American Journal of Physiology*
- ISPAD Clinical Practice Consensus Guidelines 2022 — Exercise in children and adolescents with diabetes
- Dalla Man C et al. (2007). Meal simulation model of the glucose-insulin system. *IEEE Transactions on Biomedical Engineering*

---

*Cursor AI Hackathon · TechIE Day · IE University · March 25, 2026*
