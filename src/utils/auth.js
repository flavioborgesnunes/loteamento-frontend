import { useAuthStore } from '../store/auth';
import useAxios from './useAxios';
import { jwtDecode } from 'jwt-decode';
import Cookies from 'js-cookie';
import Swal from 'sweetalert2';
import axios from './axios';

const Toast = Swal.mixin({
    toast: true,
    position: 'top',
    showConfirmButton: false,
    timer: 1500,
    timerProgressBar: true,
});

export const login = async (email, password) => {
    try {
        const { data, status } = await axios.post('user/token/', {
            email,
            password,
        });

        if (status === 200) {
            setAuthUser(data.access, data.refresh);

            Toast.fire({
                icon: 'success',
                title: 'Signed in successfully'
            });
        }

        return { data, error: null };
    } catch (error) {
        return {
            data: null,
            error: error?.response?.data?.detail || 'Erro de login. Verifique suas credenciais.',
        };

    }
};

export const registerCliente = async (email, password, password2) => {
    try {
        const payload = {
            email,
            password,
            password2,
            role: 'dono',
        };

        const { data } = await axios.post('user/register/', payload);

        await login(email, password);

        Toast.fire({
            icon: 'success',
            title: 'Cadastro realizado com sucesso!'
        });

        return { data, error: null };
    } catch (error) {
        console.log("Erro ao registrar cliente:", error.response?.data);
        return {
            data: null,
            error: error.response?.data || 'Erro ao registrar cliente',
        };
    }
};

export const registerUsuarioInterno = async (email, role) => {
    try {
        const currentUser = useAuthStore.getState().user();

        const payload = {
            email,
            password: 'placeholder2025',
            password2: 'placeholder2025',
            role,
            dono: currentUser?.role === 'dono' ? currentUser?.user_id : currentUser?.dono,
        };

        const axiosAuth = useAxios();
        const { data } = await axiosAuth.post('user/register/', payload);

        Toast.fire({
            icon: 'success',
            title: 'Usuário criado com sucesso! Ele receberá um e-mail para definir a senha.'
        });

        return { data, error: null };
    } catch (error) {
        console.log("Erro ao registrar usuário interno:", error.response?.data);
        return {
            data: null,
            error: error.response?.data || 'Erro ao registrar usuário',
        };
    }
};



export const logout = () => {
    Cookies.remove('access_token');
    Cookies.remove('refresh_token');
    useAuthStore.getState().setUser(null);

    Toast.fire({
        icon: 'success',
        title: 'You have been logged out.'
    });
};

export const setUser = async () => {
    const accessToken = Cookies.get('access_token');
    const refreshToken = Cookies.get('refresh_token');

    if (!accessToken || !refreshToken) {
        return false;
    }

    try {
        if (isAccessTokenExpired(accessToken)) {
            const response = await getRefreshToken(refreshToken);
            setAuthUser(response.access, response.refresh);
        } else {
            setAuthUser(accessToken, refreshToken);
        }
        return true;
    } catch (error) {
        console.error("Erro ao renovar token:", error);
        logout(); // remove tokens e reseta estado
        return false;
    }
};


export const setAuthUser = (access_token, refresh_token) => {
    Cookies.set('access_token', access_token, {
        expires: 1,
        secure: true,
    });

    Cookies.set('refresh_token', refresh_token, {
        expires: 7,
        secure: true,
    });

    const user = jwtDecode(access_token) ?? null;

    if (user) {
        useAuthStore.getState().setUser(user);
    }
    useAuthStore.getState().setLoading(false);
};


export const getRefreshToken = async () => {
    const refresh_token = Cookies.get('refresh_token');

    const response = await axios.post('user/token/refresh/', {
        refresh: refresh_token,
    });

    return response.data;
};

export const isAccessTokenExpired = (accessToken) => {
    try {
        const decodedToken = jwtDecode(accessToken);
        return decodedToken.exp < Date.now() / 1000;
    } catch (err) {
        return true;
    }
};
