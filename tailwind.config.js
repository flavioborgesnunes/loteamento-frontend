export default {
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Open Sans', 'sans-serif'],
            },
            colors: {
                primary: '#2569BC',
                secondary: '#21C0FD',
                danger: {
                    light: '#FCA5A5',
                    DEFAULT: '#EF4444',
                    dark: '#B91C1C',
                },
            },
        },
    },
    plugins: [],
};
