/**
 * RIALO NEURAL GRID ENGINE v2.0
 * High-Density Interactive Particle System
 * Designed for: sheingelzs GitHub Repository
 */

const canvas = document.getElementById('neural-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
let mouse = { x: null, y: null, radius: 180 };

// Tracking pergerakan mouse
window.addEventListener('mousemove', (e) => { 
    mouse.x = e.x; 
    mouse.y = e.y; 
});

// Menyesuaikan ukuran jika jendela browser di-resize
window.addEventListener('resize', () => { 
    initCanvas(); 
});

function initCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    particles = [];
    
    // JUMLAH JARING (Makin kecil pembaginya, makin ramai jaringnya)
    let numberOfParticles = (canvas.width * canvas.height) / 4000; 
    
    for (let i = 0; i < numberOfParticles; i++) {
        particles.push(new Particle());
    }
}

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 1.5 + 0.5; // Ukuran titik
        this.vx = (Math.random() - 0.5) * 0.4; // Kecepatan X
        this.vy = (Math.random() - 0.5) * 0.4; // Kecepatan Y
    }

    draw() {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.8)'; // Warna Ungu Rialo
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }

    update() {
        // Gerakan standar
        this.x += this.vx;
        this.y += this.vy;

        // Memantul jika kena pinggir layar
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;

        // Interaksi dengan Mouse (Efek menghindar)
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
        
        // LOGIKA PENYAMBUNG GARIS (JARING-JARING)
        for (let j = i + 1; j < particles.length; j++) {
            let dx = particles[i].x - particles[j].x;
            let dy = particles[i].y - particles[j].y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            
            // Jarak maksimal antar titik untuk membuat garis
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

// Inisialisasi awal
initCanvas();
animate();
