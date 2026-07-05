// Portfolio JavaScript - Animations and Interactions

// Global variables
let particles = [];
let animationId;
let customCursor;

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// Initialize all app functionality
function initializeApp() {
    createCustomCursor();
    initParticleSystem();
    initTypewriter();
    initScrollAnimations();
    initNavigation();
    initSkillBars();
    initProjectFilters();
    initTimeline();
    initContactForm();
    initMobileMenu();
    addLoadingAnimations();
}

// Custom Cursor
function createCustomCursor() {
    // Check if we're on a touch device
   
    // Hide cursor when mouse leaves window
    document.addEventListener('mouseleave', () => {
        if (customCursor) customCursor.style.opacity = '0';
    });

    document.addEventListener('mouseenter', () => {
        if (customCursor) customCursor.style.opacity = '1';
    });
    
}

// Particle System
function initParticleSystem() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Particle class
    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = (Math.random() - 0.5) * 2;
            this.vy = (Math.random() - 0.5) * 2;
            this.radius = Math.random() * 3 + 1;
            this.alpha = Math.random() * 0.5 + 0.2;
            this.color = ['#3b82f6', '#8b5cf6', '#06b6d4'][Math.floor(Math.random() * 3)];
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
            if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
        }

        draw() {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // Initialize particles
    for (let i = 0; i < 50; i++) {
        particles.push(new Particle());
    }

    // Animation loop
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });

        // Draw connections
        particles.forEach((particle, i) => {
            particles.slice(i + 1).forEach(otherParticle => {
                const dx = particle.x - otherParticle.x;
                const dy = particle.y - otherParticle.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 100) {
                    ctx.save();
                    ctx.globalAlpha = (100 - distance) / 100 * 0.2;
                    ctx.strokeStyle = '#3b82f6';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(particle.x, particle.y);
                    ctx.lineTo(otherParticle.x, otherParticle.y);
                    ctx.stroke();
                    ctx.restore();
                }
            });
        });

        animationId = requestAnimationFrame(animate);
    }

    animate();
}

// Typewriter Effect
function initTypewriter() {
    const typewriterElement = document.getElementById('typewriter');
    if (!typewriterElement) return;

    const text = 'Hemant Godve';
    let index = 0;

    function typeWriter() {
        if (index < text.length) {
            typewriterElement.textContent += text.charAt(index);
            index++;
            setTimeout(typeWriter, 150);
        } else {
            typewriterElement.style.borderRight = 'none';
        }
    }

    setTimeout(typeWriter, 1000);
}

// Scroll Animations
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';

                // Trigger skill bar animations
                if (entry.target.classList.contains('skill-item')) {
                    animateSkillBar(entry.target);
                }
            }
        });
    }, observerOptions);

    // Observe elements with animation classes
    const animatedElements = document.querySelectorAll('.fade-in-up, .fade-in-left, .fade-in-right, .skill-item');
    animatedElements.forEach(el => {
        observer.observe(el);
    });
}

// Navigation
function initNavigation() {
    const navbar = document.getElementById('navbar');
    const navLinks = document.querySelectorAll('.nav-link');

    // Smooth scrolling
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            const targetSection = document.querySelector(targetId);

            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Navbar background on scroll
    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            navbar.style.background = 'rgba(255, 255, 255, 0.98)';
            navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
        } else {
            navbar.style.background = 'rgba(255, 255, 255, 0.95)';
            navbar.style.boxShadow = 'none';
        }
    });

    // Active nav link highlighting
    const sections = document.querySelectorAll('section[id]');

    window.addEventListener('scroll', () => {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            if (window.scrollY >= sectionTop - 200) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
}

// Skill Bars Animation
function initSkillBars() {
    // This will be triggered by the intersection observer
}

function animateSkillBar(skillItem) {
    const progressBar = skillItem.querySelector('.skill-progress');
    const width = progressBar.getAttribute('data-width');

    if (progressBar && width) {
        setTimeout(() => {
            progressBar.style.width = width;
        }, 300);
    }
}

// Project Filters
function initProjectFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const projectCards = document.querySelectorAll('.project-card');

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const filterValue = button.getAttribute('data-filter');

            projectCards.forEach(card => {
                const category = card.getAttribute('data-category');

                if (filterValue === 'all' || category === filterValue) {
                    card.style.display = 'block';
                    card.classList.remove('hidden');
                    setTimeout(() => {
                        card.style.opacity = '1';
                        card.style.transform = 'scale(1)';
                    }, 100);
                } else {
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.8)';
                    setTimeout(() => {
                        card.style.display = 'none';
                        card.classList.add('hidden');
                    }, 300);
                }
            });
        });
    });
}

// Timeline Animation
function initTimeline() {
    const timelineItems = document.querySelectorAll('.timeline-item');

    const timelineObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, {
        threshold: 0.3,
        rootMargin: '0px 0px -100px 0px'
    });

    timelineItems.forEach((item, index) => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(50px)';
        item.style.transition = `all 0.6s ease ${index * 0.2}s`;
        timelineObserver.observe(item);
    });
}

// Contact Form
function initContactForm() {
    const form = document.getElementById('contact-form');

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            // Get form data
            const formData = new FormData(form);
            const data = Object.fromEntries(formData);

            // Simulate form submission
            const submitButton = form.querySelector('button[type="submit"]');
            const originalText = submitButton.innerHTML;

            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            submitButton.disabled = true;

            setTimeout(() => {
                submitButton.innerHTML = '<i class="fas fa-check"></i> Message Sent!';
                submitButton.style.background = '#22c55e';

                setTimeout(() => {
                    submitButton.innerHTML = originalText;
                    submitButton.style.background = '';
                    submitButton.disabled = false;
                    form.reset();
                }, 2000);
            }, 2000);
        });

        // Floating label animation
        const formInputs = form.querySelectorAll('input, textarea');
        formInputs.forEach(input => {
            input.addEventListener('focus', () => {
                input.parentElement.classList.add('focused');
            });

            input.addEventListener('blur', () => {
                if (!input.value) {
                    input.parentElement.classList.remove('focused');
                }
            });
        });
    }
}

// Mobile Menu
function initMobileMenu() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        // Close menu when clicking on links
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
    }
}

// Loading Animations
function addLoadingAnimations() {
    // Add stagger animation to elements
    const staggerElements = document.querySelectorAll('.hero-text > *');
    staggerElements.forEach((element, index) => {
        element.style.animationDelay = `${index * 0.2}s`;
    });

    // Preload images for better performance
    preloadImages();
}

// Preload Images
function preloadImages() {
    const imageUrls = [
        // Add any image URLs here if you're using external images
        "Rushu.jpg",
        "https://static.vecteezy.com/system/resources/previews/000/544/202/non_2x/blue-technology-circle-and-computer-science-abstract-background-with-blue-and-binary-code-matrix-business-and-connection-futuristic-and-industry-4-0-concept-internet-cyber-and-network-theme-vector.jpg"
    ];

    imageUrls.forEach(url => {
        const img = new Image();
        img.src = url;
    });
}

// Scroll to Top functionality
window.addEventListener('scroll', () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    // Show/hide scroll to top button
    const scrollButton = document.querySelector('.scroll-to-top');
    if (scrollButton) {
        if (scrollTop > 300) {
            scrollButton.style.opacity = '1';
            scrollButton.style.visibility = 'visible';
        } else {
            scrollButton.style.opacity = '0';
            scrollButton.style.visibility = 'hidden';
        }
    }
});

// Add scroll to top button
function addScrollToTopButton() {
    const button = document.createElement('button');
    button.className = 'scroll-to-top';
    button.innerHTML = '<i class="fas fa-arrow-up"></i>';
    button.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: var(--primary-color);
        color: white;
        border: none;
        cursor: pointer;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        z-index: 1000;
        box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
    `;

    button.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    document.body.appendChild(button);
}

// Initialize scroll to top button
addScrollToTopButton();

// Performance optimization for scroll events
let ticking = false;

function updateScrollElements() {
    // Update scroll-dependent elements here
    ticking = false;
}

window.addEventListener('scroll', () => {
    if (!ticking) {
        requestAnimationFrame(updateScrollElements);
        ticking = true;
    }
});

// Cleanup function for when page is unloaded
window.addEventListener('beforeunload', () => {
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
});

// Add soe interactive easter eggs
let HRG = [];
const HRGCode = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65]; // Up Up Down Down Left Right Left Right B A

document.addEventListener('keydown', (e) => {
    HRG.push(e.keyCode);
    if (HRG.length > HRGCode.length) {
        HRG.shift();
    }

    if (HRG.join(',') === HRGCode.join(',')) {
        // Easter egg: Make particles rainbow colored
        particles.forEach(particle => {
            particle.color = `hsl(${Math.random() * 360}, 70%, 60%)`;
        });

        // Show a fun message
        const message = document.createElement('div');
        message.textContent = '🎉 Easter egg activated! Rainbow particles!';
        message.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px;
            border-radius: 10px;
            z-index: 10000;
            animation: fadeInUp 0.5s ease;
        `;
        document.body.appendChild(message);

        setTimeout(() => {
            message.remove();
        }, 3000);

        HRG = [];
    }
});

// Accessibility improvements
document.addEventListener('keydown', (e) => {
    // Skip navigation for screen readers
    if (e.key === 'Tab' && e.shiftKey) {
        // Handle reverse tab navigation
    }
});

// Add focus indicators for keyboard navigation
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        document.body.classList.add('keyboard-navigation');
    }
});

document.addEventListener('mousedown', () => {
    document.body.classList.remove('keyboard-navigation');
});

// Console message for developers
console.log(`
🚀 Portfolio Website
Built with vanilla HTML, CSS, and JavaScript
Features:
- Particle system animation
- Smooth scroll animations
- Interactive project filtering
- Responsive design
- Custom cursor
- Mobile-friendly navigation

Author: Hemant Godve
`);