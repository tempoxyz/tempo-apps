import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => c.html(renderPage()))

function renderPage(): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Quibble Race</title>
	<style>${css}</style>
</head>
<body>
	<main class="shell">
		<section class="hero">
			<div>
				<p class="eyebrow">Tempo wager desk</p>
				<h1>Quibble Race</h1>
			</div>
			<div class="wallet">
				<span id="walletStatus">Tempo wallet: guest</span>
				<button id="connectWallet" type="button">Connect</button>
			</div>
		</section>
		<section class="layout">
			<div class="track-panel">
				<div class="race-header">
					<div>
						<p class="label">Race 4217</p>
						<h2 id="raceState">Choose a quibble</h2>
					</div>
					<div class="pot">
						<span>Pot</span>
						<strong id="potAmount">$0.00</strong>
					</div>
				</div>
				<div class="track" id="track"></div>
				<div class="finish-line" aria-hidden="true"></div>
			</div>
			<aside class="book">
				<div class="balance-card">
					<span>Bankroll</span>
					<strong id="bankroll">$50.00</strong>
					<button id="reup" type="button">Re-up</button>
				</div>
				<label class="field">
					<span>Bet</span>
					<input id="stake" inputmode="decimal" min="1" step="1" type="number" value="10" />
				</label>
				<div class="field">
					<span>Pick</span>
					<div class="picks" id="picks"></div>
				</div>
				<button class="race-button" id="startRace" type="button">Place bet and race</button>
				<div class="ticket" id="ticket">No open ticket.</div>
			</aside>
		</section>
		<section class="ledger">
			<div class="section-title">
				<h2>Recent action</h2>
				<span id="settlementMode">settlement: local preview</span>
			</div>
			<div id="ledgerRows" class="rows"></div>
		</section>
	</main>
	<script>${js}</script>
</body>
</html>`
}

const css = `
:root {
	color-scheme: dark;
	--bg: #10110f;
	--panel: #191b18;
	--ink: #f3f0e8;
	--muted: #a8aa9e;
	--line: #34372f;
	--tempo: #00e08f;
	--amber: #ffbf47;
	--red: #ff6666;
	--blue: #74a7ff;
}
* { box-sizing: border-box; }
body {
	margin: 0;
	background: radial-gradient(circle at 50% 0%, #283225 0%, var(--bg) 42rem);
	color: var(--ink);
	font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
button, input { font: inherit; }
button {
	border: 1px solid var(--line);
	background: #242720;
	color: var(--ink);
	border-radius: 8px;
	cursor: pointer;
	min-height: 42px;
}
button:hover { border-color: var(--tempo); }
.shell { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; padding: 28px 0; }
.hero { display: flex; justify-content: space-between; align-items: end; gap: 20px; margin-bottom: 20px; }
.eyebrow, .label { color: var(--tempo); text-transform: uppercase; letter-spacing: .08em; font-size: 12px; margin: 0 0 6px; }
h1 { font-size: clamp(42px, 8vw, 96px); margin: 0; line-height: .9; letter-spacing: 0; }
h2 { margin: 0; font-size: 24px; }
.wallet { display: flex; align-items: center; gap: 12px; color: var(--muted); }
.wallet button, #reup { padding: 0 16px; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; }
.track-panel, .book, .ledger { background: color-mix(in srgb, var(--panel) 94%, black); border: 1px solid var(--line); border-radius: 8px; }
.track-panel { position: relative; padding: 20px; min-height: 520px; overflow: hidden; }
.race-header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 18px; }
.pot { text-align: right; color: var(--muted); }
.pot strong { display: block; color: var(--amber); font-size: 28px; }
.track { display: grid; gap: 14px; }
.lane { position: relative; height: 72px; border: 1px solid var(--line); border-radius: 8px; background: repeating-linear-gradient(90deg, #20231d 0 48px, #242820 48px 50px); overflow: hidden; }
.quibble { position: absolute; left: 8px; top: 10px; width: 54px; height: 50px; transition: transform .16s linear; }
.quibble::before { content: ""; position: absolute; inset: 8px 4px 4px; border-radius: 18px 18px 12px 12px; background: var(--q); box-shadow: inset 0 -7px 0 rgb(0 0 0 / .18); }
.quibble::after { content: attr(data-name); position: absolute; left: 62px; top: 12px; width: 160px; color: var(--ink); font-weight: 700; }
.eye { position: absolute; top: 20px; width: 7px; height: 7px; border-radius: 50%; background: #111; z-index: 1; }
.eye.left { left: 20px; }
.eye.right { left: 34px; }
.finish-line { position: absolute; top: 106px; right: 72px; bottom: 20px; width: 6px; background: repeating-linear-gradient(0deg, var(--ink) 0 14px, #111 14px 28px); opacity: .8; }
.book { padding: 16px; display: grid; gap: 14px; align-content: start; }
.balance-card { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; padding: 14px; border: 1px solid var(--line); border-radius: 8px; }
.balance-card span, .field span { color: var(--muted); }
.balance-card strong { font-size: 28px; }
.balance-card #reup { grid-column: 1 / -1; background: var(--tempo); color: #06140f; border: 0; font-weight: 800; }
.field { display: grid; gap: 8px; }
input { width: 100%; min-height: 42px; border-radius: 8px; border: 1px solid var(--line); background: #10120f; color: var(--ink); padding: 0 12px; }
.picks { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pick.selected { border-color: var(--tempo); background: #113226; }
.race-button { background: var(--amber); color: #1b1300; border: 0; font-weight: 900; }
.ticket { min-height: 104px; border: 1px dashed var(--line); border-radius: 8px; padding: 12px; color: var(--muted); line-height: 1.5; }
.ledger { margin-top: 18px; padding: 16px; }
.section-title { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 12px; color: var(--muted); }
.rows { display: grid; gap: 8px; }
.row { display: grid; grid-template-columns: 90px 1fr auto; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); align-items: center; }
.win { color: var(--tempo); }
.loss { color: var(--red); }
@media (max-width: 840px) {
	.shell { width: min(100vw - 20px, 680px); padding-top: 16px; }
	.hero, .section-title { align-items: start; flex-direction: column; }
	.layout { grid-template-columns: 1fr; }
	.track-panel { min-height: 460px; }
	.quibble::after { width: 104px; font-size: 13px; }
	.row { grid-template-columns: 1fr; }
}
`

const js = `
const quibbles = [
	{ id: "nib", name: "Nib", color: "#00e08f", odds: 2.1, speed: 0.97 },
	{ id: "wump", name: "Wump", color: "#ffbf47", odds: 3.4, speed: 0.9 },
	{ id: "bazz", name: "Bazz", color: "#74a7ff", odds: 4.0, speed: 0.86 },
	{ id: "plonk", name: "Plonk", color: "#ff6666", odds: 5.5, speed: 0.8 },
	{ id: "dree", name: "Dree", color: "#d6a5ff", odds: 7.2, speed: 0.74 },
];

const state = {
	bankroll: 50,
	selected: quibbles[0].id,
	connected: false,
	racing: false,
	ledger: [],
	positions: Object.fromEntries(quibbles.map((q) => [q.id, 0])),
};

const el = {
	track: document.querySelector("#track"),
	picks: document.querySelector("#picks"),
	stake: document.querySelector("#stake"),
	bankroll: document.querySelector("#bankroll"),
	pot: document.querySelector("#potAmount"),
	ticket: document.querySelector("#ticket"),
	start: document.querySelector("#startRace"),
	reup: document.querySelector("#reup"),
	wallet: document.querySelector("#walletStatus"),
	connect: document.querySelector("#connectWallet"),
	ledger: document.querySelector("#ledgerRows"),
	raceState: document.querySelector("#raceState"),
	settlementMode: document.querySelector("#settlementMode"),
};

function money(value) {
	return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function buildTempoPaymentPayload(kind, amount) {
	return {
		chainId: 4217,
		kind,
		amountUsd: amount,
		memo: kind === "reup" ? "Quibble Race re-up" : "Quibble Race wager",
	};
}

function render() {
	el.bankroll.textContent = money(state.bankroll);
	el.wallet.textContent = state.connected ? "Tempo wallet: connected" : "Tempo wallet: guest";
	el.connect.textContent = state.connected ? "Connected" : "Connect";
	el.settlementMode.textContent = state.connected ? "settlement: tempo ready" : "settlement: local preview";
	const stake = Number(el.stake.value || 0);
	el.pot.textContent = money(Math.max(0, stake) * quibbles.length * 0.82);
	el.track.innerHTML = quibbles.map((q) => {
		const x = state.positions[q.id] || 0;
		return '<div class="lane"><div class="quibble" data-name="' + q.name + ' ' + q.odds.toFixed(1) + 'x" style="--q:' + q.color + '; transform: translateX(' + x + '%)"><span class="eye left"></span><span class="eye right"></span></div></div>';
	}).join("");
	el.picks.innerHTML = quibbles.map((q) => '<button type="button" class="pick ' + (state.selected === q.id ? "selected" : "") + '" data-pick="' + q.id + '">' + q.name + " " + q.odds.toFixed(1) + "x</button>").join("");
	el.ledger.innerHTML = state.ledger.length ? state.ledger.map((row) => '<div class="row"><span>' + row.time + '</span><span>' + row.text + '</span><strong class="' + row.kind + '">' + row.amount + '</strong></div>').join("") : '<div class="row"><span>--</span><span>No settlements yet.</span><strong>$0.00</strong></div>';
}

function settle(kind, text, amount) {
	state.ledger.unshift({
		time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
		kind,
		text,
		amount,
	});
	state.ledger = state.ledger.slice(0, 8);
}

function chooseWinner() {
	const rolls = quibbles.map((q) => ({ q, score: Math.random() * q.speed + Math.random() * 0.35 }));
	return rolls.sort((a, b) => b.score - a.score)[0].q;
}

function runRace() {
	if (state.racing) return;
	const stake = Number(el.stake.value || 0);
	const pick = quibbles.find((q) => q.id === state.selected);
	if (!pick || !Number.isFinite(stake) || stake <= 0) {
		el.ticket.textContent = "Enter a valid stake.";
		return;
	}
	if (stake > state.bankroll) {
		el.ticket.textContent = "Bankroll short. Hit re-up.";
		return;
	}
	state.racing = true;
	state.bankroll -= stake;
	state.positions = Object.fromEntries(quibbles.map((q) => [q.id, 0]));
	el.raceState.textContent = "Racing";
	el.ticket.textContent = "Tempo payload ready: " + JSON.stringify(buildTempoPaymentPayload("wager", stake));
	render();

	const winner = chooseWinner();
	let tick = 0;
	const timer = window.setInterval(() => {
		tick += 1;
		for (const q of quibbles) {
			const burst = q.id === winner.id ? 2.2 : 1.2;
			state.positions[q.id] = Math.min(92, state.positions[q.id] + Math.random() * burst + q.speed);
		}
		state.positions[winner.id] = Math.min(96, state.positions[winner.id] + 1.8);
		render();
		if (tick > 38 || state.positions[winner.id] >= 92) {
			window.clearInterval(timer);
			state.positions[winner.id] = 96;
			state.racing = false;
			const won = winner.id === pick.id;
			const payout = won ? stake * pick.odds : 0;
			state.bankroll += payout;
			el.raceState.textContent = winner.name + " wins";
			el.ticket.textContent = won ? "Paid " + money(payout) + " on " + pick.name + "." : pick.name + " missed. Winner: " + winner.name + ".";
			settle(won ? "win" : "loss", "Bet " + money(stake) + " on " + pick.name + "; winner " + winner.name, won ? "+" + money(payout - stake) : "-" + money(stake));
			render();
		}
	}, 120);
}

el.picks.addEventListener("click", (event) => {
	const button = event.target.closest("[data-pick]");
	if (!button) return;
	state.selected = button.dataset.pick;
	render();
});

el.stake.addEventListener("input", render);
el.start.addEventListener("click", runRace);
el.connect.addEventListener("click", () => {
	state.connected = true;
	render();
});
el.reup.addEventListener("click", () => {
	const amount = 50;
	state.bankroll += amount;
	el.ticket.textContent = "Tempo payload ready: " + JSON.stringify(buildTempoPaymentPayload("reup", amount));
	settle("win", "Loan shark re-up", "+" + money(amount));
	render();
});

render();
`

export default app
