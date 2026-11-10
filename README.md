# CCTV Business Manager

A simple app for running a CCTV installation and service business. It works on a phone or a computer, runs offline, and needs no server or login.

## Job workflow

Every job goes through these steps, in order. The job page always shows the next step.

| # | Step | What happens |
|---|------|--------------|
| 1 | **Enquiry** | Save the customer's name, phone, site address, job type, requirement and estimate. |
| 2 | **Assign to team** | Pick one or more technicians and set a visit date. Each person's open jobs are shown so you can balance the work. |
| 3 | **Issue material** | Give items from stock to the team. Stock goes down right away, and you can't issue more than you have. For service visits that need nothing, use *Skip — no material needed*. |
| 4 | **Work done** | Enter work notes and how much of each item was **actually used** on site. Add labour, discount and tax. |
| 5 | **Payment & feedback** | The bill is calculated for you. Record payments (part payments are fine), take a 1–5 star rating with comments, or send the bill and a feedback request on WhatsApp. |
| 6 | **Close** | Close the job. Any unpaid balance stays under *Payment due* until it's collected. |
| 7 | **Return unused material** | Enter what the team brought back. It goes back into stock. Anything missing is recorded as a **shortfall** (lost or damaged). |

You can cancel a job before the work is done. Any material already issued goes straight back to stock.

## Other features

- **Dashboard**: how many jobs are at each step, collections, dues, overdue visits, material waiting to come back, low stock.
- **Stock**: items with cost and sale price, reorder levels, stock-in (purchases), count corrections, and a history of every movement linked to its job.
- **Team**: technicians and helpers, their open and completed jobs, and their average rating.
- **Reports**: for any date range: billed, collected, material cost, gross margin, dues, team performance, materials used, payment modes, shortfalls. Jobs export to CSV for Excel.
- **Invoice**: printable invoice for each job (Print / Save as PDF).
- **Backup / restore**: download your data as a JSON file and load it on another device.

## Running it

**Easiest:** open `index.html` in any browser (Chrome, Edge, Safari, Firefox).

**As an installable phone app:** host the folder anywhere that serves static files over HTTPS (GitHub Pages, Netlify, etc.). Open it on your phone and choose *Add to Home Screen*. It then works offline.

**Locally with a web server:**

```bash
npm start        # serves on http://localhost:8080
```

Click **Try with sample data** on the first screen to look around with demo jobs.

## Important: where your data lives

Data is stored in the browser on the device you use (`localStorage`). It does **not** sync between devices on its own. Use **Settings → Download backup** regularly, and **Restore backup** to move data to another device. Clearing browser data will erase it.

## Development

- `js/store.js`: all business rules (workflow, stock, billing, reports), with no UI code
- `js/app.js`: the user interface (plain JavaScript, no build step)
- `css/styles.css`: styles (light and dark mode, works on phones)
- `tests/`: tests for the workflow and stock maths

```bash
npm test
```
