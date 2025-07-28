import axios from 'axios';
import Cookies from 'js-cookie';
import { getRefreshToken, isValidToken, setAuthUser, logout } from './auth';
import { API_BASE_URL } from './constants';

const useAxios = () => {
    const axiosInstance = axios.create({
        baseURL: API_BASE_URL,
    });

    // Interceptor de requisição
    axiosInstance.interceptors.request.use(
        async (req) => {
            let accessToken = Cookies.get('access_token');
            let refreshToken = Cookies.get('refresh_token');

            // Se não há token, segue sem modificar a requisição
            if (!accessToken || !refreshToken) return req;

            // Se o access token está expirado, tenta renovar
            if (!isValidToken(accessToken)) {
                try {
                    const refreshed = await getRefreshToken(refreshToken);
                    accessToken = refreshed.access;
                    refreshToken = refreshed.refresh;

                    setAuthUser(accessToken, refreshToken);
                } catch (err) {
                    console.error("Erro ao renovar token:", err);
                    logout();
                    window.location.href = '/login';
                    return Promise.reject(err);
                }
            }

            req.headers.Authorization = `Bearer ${accessToken}`;
            return req;
        },
        (error) => Promise.reject(error)
    );

    return axiosInstance;
};

export default useAxios;
