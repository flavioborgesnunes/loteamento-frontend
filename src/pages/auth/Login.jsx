import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../../utils/auth';
import { useAuthStore } from '../../store/auth';
import Contact from '../../components/Contact';
import imagemAuth from '../auth/images/img-auth.png'
import logo from '../auth/images/logoctz.png'

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const setLoading = useAuthStore(state => state.setLoading);
    const loading = useAuthStore(state => state.loading);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const { error } = await login(email, password);

        setLoading(false);

        if (error) {
            setError('Usuário ou senha incorretos.');
        } else {
            navigate('/dashboard');
        }
    };

    return (
        <section className="flex flex-col items-center justify-center">
            <div className='flex w-full'>
                <div className='flex flex-1 flex-col justify-center items-center p-3 mt-10'>
                    <h1 className="text-3xl md:text-4xl text-center font-medium gradiente my-10 w-full">Bem-Vindo</h1>
                    <p className='font-bold mb-5'>Digite o seu endereço de e-mail e senha.</p>

                    <form onSubmit={handleSubmit} className="w-full md:w-[460px]">

                        {error && (
                            <div className="mb-4 text-red-600 text-sm bg-red-100 border border-red-300 rounded px-3 py-2">
                                {error}
                            </div>
                        )}
                        <div className="w-full">
                            <label className="block mb-2 text-sm font-bold">E-mail</label>
                            <input
                                type="email"
                                autoComplete="email"
                                className="w-full h-10 mb-4 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder='Digite Seu E-mail'
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className="w-full">
                            <label className="block mb-2 text-sm font-bold">Senha</label>
                            <input
                                type="password"
                                autoComplete="current-password"
                                className="w-full h-10 mb-4 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder='****************'
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className='bg-linear-to-r from-padrao-100 to-padrao-900 w-full h-10 rounded-md mt-3 text-white cursor-pointer'                        >
                            {loading ? 'Entrando...' : 'Entrar'}
                        </button>

                        <p className="text-sm text-right mt-2">
                            <a href="/esqueci-senha" className="text-gray-400 hover:underline">
                                Redefinir Senha
                            </a>
                        </p>
                        <p className="text-sm text-center mt-4">
                            Ainda não tem conta? <a href="/register-cliente" className="text-blue-500 hover:underline">Criar conta</a>
                        </p>
                    </form>
                    <img src={logo} alt="" className='mt-10' />
                </div>
                <div className='hidden md:block flex-1'>
                    <img src={imagemAuth} alt="" />
                </div>
            </div>
            <Contact />
        </section>
    );
}

export default Login;
