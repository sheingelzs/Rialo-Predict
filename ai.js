/**
 * RIALO ALL-IN-ONE ENGINE v4.0 (FIXED)
 * High-Density Visuals + Accurate Oracle Data
 * Repository: sheingelzs
 */

// ==========================================
// 1. NEURAL GRID ENGINE (Visual Jaring-Jaring)
// ==========================================
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

// ==========================================
// 2. RIALO ORACLE DATA (Data Akurat & Lengkap)
// ==========================================
const RialoOracle = {
    "rialo": "<b>[DEFINITION: RIALO NETWORK]</b><br><br>RIALO adalah <b>Supermodular Layer 1 Blockchain</b> yang dirancang untuk menghubungkan Real-World Finance (RWF) ke Web3 secara langsung.<br><br>• <b>Misi:</b> Menghilangkan ketergantungan pada middleware/oracle yang lambat.<br>• <b>Rialo Edge:</b> Memungkinkan dApps berkomunikasi langsung dengan internet tanpa perantara.<br>• <b>Privacy:</b> Enkripsi pesan native yang terhubung ke Email/Phone/Device ID.",

    "backed": "<b>[BACKING & LEADERSHIP]</b><br><br>Rialo didukung oleh institusi papan atas dan tim kriptografer elit:<br><br>• <b>Pendanaan:</b> Berhasil mengumpulkan <b>$20 Juta Seed Round</b> yang dipimpin oleh <span class='text-white'>Pantera Capital</span>.<br>• <b>Builder:</b> Dikembangkan oleh <span class='text-white'>Subzero Labs</span>.<br>• <b>Tokoh Kunci:</b> Dipimpin oleh <b>Jan Camenisch</b> (Mantan Head of Research di IBM & DFINITY).<br>• <b>Tim Elit:</b> Insinyur dari Google, Apple, Microsoft, Amazon, Solana, dan Near.",

    "arch": "<b>[CORE ARCHITECTURE - TECHNICAL]</b><br><br>• <b>Rialo VM:</b> Berbasis <b>RISC-V</b>. Kompatibel dengan SVM (Solana), EVM, dan MoveVM.<br>• <b>Konsensus:</b> Mekanisme multi-concurrent proposer dengan <b>50ms Block Time</b>.<br>• <b>Execution:</b> Event-driven dengan <i>Conditional Transactions</i> untuk latensi nanosekon.",

    "feat": "<b>[NATIVE CAPABILITIES]</b><br><br>• <b>Rialo Stream:</b> Data feeds (Oracles) native yang 40x lebih cepat.<br>• <b>Rialo Interop:</b> Protokol interoperabilitas 10x lebih cepat dari bridge biasa.<br>• <b>Rialo Cruise:</b> Fitur <b>Gas-less Transactions</b> untuk user baru.<br>• <b>Rialo Read Path:</b> Akses data validator langsung (100ms) untuk menekan biaya.",

    "roadmap": "<b>[ROADMAP 2025-2026]</b><br><br>• <b>Q1-Q2 2025:</b> Penyelesaian Seed Round | Private Devnet.<br>• <b>Q3 2025:</b> Keluar dari Stealth Mode | 20+ Data Providers.<br>• <b>Q4 2025:</b> Peluncuran Testnet v1 | Builder Programs.<br>• <b>2026:</b> <b>MAINNET GENESIS LAUNCH.</b>"
};

// ==========================================
// 3. CHAT SYSTEM LOGIC
// ==========================================
window.handleSend = function() {
    const input = document.getElementById('user-input');
    const text = input.value.toLowerCase().trim();
    if (text === "") return;

    addBubble(input.value, 'user');
    input.value = "";

    setTimeout(() => {
        let responses = [];
        // Pencarian keyword yang lebih akurat
        if (text.includes("rialo") || text.includes("apa") || text.includes("what")) responses.push(RialoOracle.rialo);
        if (text.includes("back") || text.includes("pantera") || text.includes("who") || text.includes("dana")) responses.push(RialoOracle.backed);
        if (text.includes("arch") || text.includes("tech") || text.includes("vm") || text.includes("arsitektur")) responses.push(RialoOracle.arch);
        if (text.includes("feat") || text.includes("fitur") || text.includes("cruise") || text.includes("stream")) responses.push(RialoOracle.feat);
        if (text.includes("road") || text.includes("plan") || text.includes("2026") || text.includes("kapan")) responses.push(RialoOracle.roadmap);

        let finalMsg = responses.length > 0 
            ? responses.join("<br><br>") 
            : "<b>[ERROR]</b>: Query di luar parameter teknis. Gunakan keyword: <i>RIALO, BACKED, ARCHITECTURE, FEATURES,</i> atau <i>ROADMAP.</i>";
        
        addBubble(finalMsg, 'bot');
    }, 600);
};

function addBubble(msg, sender) {
    const container = document.getElementById('chat-container');
    if (!container) return;

    const bubble = document.createElement('div');
    if (sender === 'user') {
        bubble.className = 'text-xs text-white uppercase font-bold text-right border-r-2 border-white pr-4 mb-6 relative z-20';
        bubble.innerText = "QUERY: " + msg;
    } else {
        bubble.className = 'bg-[#0a0a0a]/80 border border-white/5 p-6 chat-bubble text-[11px] font-mono leading-relaxed text-purple-200 mb-8 shadow-2xl backdrop-blur-md relative z-20';
        bubble.innerHTML = "<div class='text-purple-600 font-black mb-3 border-b border-purple-900/20 pb-1 flex justify-between uppercase tracking-widest text-[9px]'><span>[RIALO_DEEP_SCAN]</span><span>Mainnet_v2.4_Oracle</span></div>";
        typeEffect(bubble, msg);
    }
    
    container.appendChild(bubble);
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
            else if (text.startsWith("<i>", i)) { content.innerHTML += "<i>"; i += 3; }
            else if (text.startsWith("</i>", i)) { content.innerHTML += "</i>"; i += 4; }
            else if (text.startsWith("<span class='text-white'>", i)) { content.innerHTML += "<span class='text-white'>"; i += 25; }
            else if (text.startsWith("</span>", i)) { content.innerHTML += "</span>"; i += 7; }
            else { content.innerHTML += text.charAt(i); i++; }
            setTimeout(type, 1); // Dipercepat biar gak nunggu lama
            document.getElementById('chat-container').scrollTop = document.getElementById('chat-container').scrollHeight;
        } else { el.innerHTML += '<span class="cursor"></span>'; }
    }
    type();
}

// Jalankan Inisialisasi
document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    animate();
    const input = document.getElementById('user-input');
    if (input) {
        input.addEventListener("keypress", (e) => { if (e.key === "Enter") handleSend(); });
    }
});
