import { useEffect } from 'react';
import { logout } from '../utils/auth';

const useAutoLogout = (timeout = 20 * 60 * 1000) => { // 20 minutos

    useEffect(() => {
        let timer;

        const resetTimer = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                logout();
                window.location.href = '/login';
            }, timeout);
        };

        const events = ['click', 'mousemove', 'keydown', 'scroll'];

        events.forEach(event =>
            window.addEventListener(event, resetTimer)
        );

        resetTimer(); // Inicializa

        return () => {
            events.forEach(event =>
                window.removeEventListener(event, resetTimer)
            );
            clearTimeout(timer);
        };
    }, [timeout]);
};

export default useAutoLogout;
