/**
 * RIALO ALL-IN-ONE ENGINE v3.0
 * Neural Grid Visuals + Oracle Chat Logic
 * Author: sheingelzs (GitHub)
 */

// --- 1. NEURAL GRID ENGINE ---
const canvas = document.getElementById('neural-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
let mouse = { x: null, y: null, radius: 180 };

window.addEventListener('mousemove', (e) => { mouse.x = e.x; mouse.y = e.y; });
window.addEventListener('resize', () => { initCanvas(); });

function initCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    particles = [];
    let numberOfParticles = (canvas.width * canvas.height) / 4000; 
    for (let i = 0; i < numberOfParticles; i++) {
        particles.push(new Particle());
    }
}

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 1.5 + 0.5;
        this.vx = (Math.random() - 0.5) * 0.4;
        this.vy = (Math.random() - 0.5) * 0.4;
    }
    draw() {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.8)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;

        let dx = mouse.x - this.x;
        let dy = mouse.y - this.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < mouse.radius) {
            const force = (mouse.radius - distance) / mouse.radius;
            this.x -= (dx / distance) * force * 3;
            this.y -= (dy / distance) * force * 3;
        }
    }
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
        for (let j = i + 1; j < particles.length; j++) {
            let dx = particles[i].x - particles[j].x;
            let dy = particles[i].y - particles[j].y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 140) { 
                ctx.strokeStyle = `rgba(147, 51, 234, ${1 - (distance / 140)})`;
                ctx.lineWidth = 0.7;
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.stroke();
            }
        }
    }
    requestAnimationFrame(animate);
}

// --- 2. RIALO ORACLE LOGIC ---
const RialoOracle = {
    "rialo": "<b>[DEFINITION: RIALO NETWORK]</b><br><br>RIALO is a <b>Supermodular Layer 1 Blockchain</b> bridging Real-World Finance (RWF) with Web3.<br><br>• <b>Mission:</b> Remove expensive middleware.<br>• <b>Rialo Edge:</b> Direct internet communication for dApps.",
    "backed": "<b>[BACKING & LEADERSHIP]</b><br><br>• <b>Funding:</b> $20M Seed Round led by <b>Pantera Capital</b>.<br>• <b>Builder:</b> Subzero Labs.<br>• <b>Key Figure:</b> Jan Camenisch (Cryptography Legend).",
    "arch": "<b>[ARCHITECTURE]</b><br><br>• <b>VM:</b> RISC-V (Compatible with SVM, EVM, Move).<br>• <b>Consensus:</b> 50ms Block Time.<br>• <b>Interop:</b> 10x faster than traditional bridges.",
    "roadmap": "<b>[ROADMAP]</b><br><br>• <b>2025:</b> Seed Round & Testnet v1.<br>• <b>2026:</b> <b>MAINNET GENESIS.</b>"
};

window.handleSend = function() {
    const input = document.getElementById('user-input');
    const text = input.value.toLowerCase();
    if (text.trim() === "") return;

    addBubble(input.value, 'user');
    input.value = "";

    setTimeout(() => {
        let r = [];
        if (text.includes("rialo") || text.includes("what")) r.push(RialoOracle.rialo);
        if (text.includes("back") || text.includes("pantera") || text.includes("who")) r.push(RialoOracle.backed);
        if (text.includes("arch") || text.includes("tech")) r.push(RialoOracle.arch);
        if (text.includes("road") || text.includes("2026")) r.push(RialoOracle.roadmap);

        let finalMsg = r.length > 0 ? r.join("<br><br>") : "ERROR: Query outside technical parameters. Try: RIALO, BACKED, or ARCHITECTURE.";
        addBubble(finalMsg, 'bot');
    }, 600);
};

function addBubble(msg, sender) {
    const container = document.getElementById('chat-container');
    const bubble = document.createElement('div');
    bubble.className = sender === 'user' 
        ? 'text-xs text-white uppercase font-bold text-right border-r-2 border-white pr-4 mb-6 relative z-20' 
        : 'bg-[#0a0a0a]/80 border border-white/5 p-6 chat-bubble text-[11px] font-mono leading-relaxed text-purple-200 mb-8 relative z-20';
    
    if (sender === 'bot') {
        bubble.innerHTML = "<div class='text-purple-600 font-black mb-3 border-b border-purple-900/20 pb-1 flex justify-between uppercase tracking-widest text-[9px]'><span>[RIALO_SCAN]</span><span>Mainnet_v2.4</span></div>";
        container.appendChild(bubble);
        typeEffect(bubble, msg);
    } else {
        bubble.innerText = "QUERY: " + msg;
        container.appendChild(bubble);
    }
    container.scrollTop = container.scrollHeight;
}

function typeEffect(el, text) {
    let i = 0;
    const content = document.createElement('span');
    el.appendChild(content);
    function type() {
        if (i < text.length) {
            if (text.substr(i, 4) === "<br>") { content.innerHTML += "<br>"; i += 4; }
            else if (text.startsWith("<b>", i)) { content.innerHTML += "<b>"; i += 3; }
            else if (text.startsWith("</b>", i)) { content.innerHTML += "</b>"; i += 4; }
            else { content.innerHTML += text.charAt(i); i++; }
            setTimeout(type, 2);
            document.getElementById('chat-container').scrollTop = document.getElementById('chat-container').scrollHeight;
        } else { el.innerHTML += '<span class="cursor"></span>'; }
    }
    type();
}

// Init Visuals
document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    animate();
    const input = document.getElementById('user-input');
    if (input) input.addEventListener("keypress", (e) => { if (e.key === "Enter") handleSend(); });
});
