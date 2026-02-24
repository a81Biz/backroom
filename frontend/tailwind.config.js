/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                "primary": "#0d7ff2",
                "background-light": "#f5f7f8",
                "background-dark": "#0a0c10",
                "surface-dark": "#161b22",
                "border-dark": "#30363d",
                "app-dark": "#101922"
            },
            fontFamily: {
                "display": ["Inter", "sans-serif"],
                "mono": ["JetBrains Mono", "monospace"]
            }
        },
    },
    plugins: [],
}
