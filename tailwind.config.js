/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./main.js",
        "./data/**/*.js"
    ],
    theme: {
        extend: {
            colors: {
                gold: '#b08d26',
                paper: '#fdfbf7',
            },
            fontFamily: {
                sans: ['Noto Kufi Arabic', 'sans-serif'],
                serif: ['Amiri', 'serif'],
            },
            animation: {
                'fade-up': 'fadeInUp 0.5s ease-out forwards',
            },
            keyframes: {
                fadeInUp: {
                    'from': { opacity: '0', transform: 'translateY(20px)' },
                    'to': { opacity: '1', transform: 'translateY(0)' },
                }
            }
        },
    },
    plugins: [],
}
