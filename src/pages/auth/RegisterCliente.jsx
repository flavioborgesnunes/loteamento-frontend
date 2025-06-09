import React, { useState } from 'react';
import { registerCliente } from '../../utils/auth';
import { useNavigate } from 'react-router-dom';
import Contact from '../../components/Contact';
import imagemAuth from '../auth/images/img-auth.png'
import logo from '../auth/images/logoctz.png'




function RegisterCliente() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [password2, setPassword2] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const [checkbox, setCheckbox] = useState(false);


    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!checkbox) {
            setError("Você precisa aceitar os Termos de Serviços e Política de Privacidade.");
            return;
        }

        const { error } = await registerCliente(email, password, password2, 'dono');

        if (error) {
            const first = typeof error === 'string' ? error : Object.values(error)[0];
            setError(first);
        } else {
            navigate('/login');
        }
    };


    return (
        <section className="flex flex-col items-center justify-center">
            <div className='flex w-full'>
                <div className='flex flex-1 flex-col justify-center items-center p-3 mt-10'>
                    <h1 className="text-3xl md:text-4xl text-center font-bold gradiente my-10 w-full">Cadastre-se</h1>
                    <p className='font-bold mb-5'>Digite o seu endereço de e-mail e senha para se cadastrar</p>


                    <form onSubmit={handleSubmit} className="w-full md:w-[460px]">

                        {error && (
                            <div className="mb-4 text-red-600 text-sm bg-red-100 border border-red-300 rounded px-3 py-2">
                                {error}
                            </div>
                        )}
                        <div className="w-full">
                            <label className="block mb-2 text-sm font-bold">Email</label>
                            <input
                                type="email"
                                className="w-full h-10 mb-4 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                value={email}
                                placeholder='Digite Seu E-mail'
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>
                        <div className="w-full">
                            <label className="block mb-2 text-sm font-bold">Senha</label>
                            <input
                                type="password"
                                className="w-full h-10 mb-4 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                value={password}
                                placeholder='Digite sua senha'
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="new-password"
                            />
                        </div>

                        <label className="block mb-2 text-sm font-bold">Confirmar Senha</label>
                        <input
                            type="password"
                            className="w-full h-10 mb-4 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            value={password2}

                            placeholder='Confirme sua senha'
                            onChange={(e) => setPassword2(e.target.value)}
                            required
                            autoComplete="new-password"
                        />

                        <button
                            type="submit"
                            className='bg-linear-to-r from-padrao-100 to-padrao-900 w-full h-10 rounded-md mt-3 text-white cursor-pointer'
                        >
                            Criar Conta
                        </button>

                        <p className="text-sm mt-3 text-center">
                            Já tem conta? <a href="/login" className="text-blue-500 hover:underline">Entrar</a>
                        </p>

                        <label className="flex items-start space-x-2 mb-4 text-sm mt-6">
                            <input
                                type="checkbox"
                                className="mt-1"
                                checked={checkbox}
                                onChange={() => setCheckbox(!checkbox)}
                                required
                            />
                            <span>
                                Eu concordo com os{' '}
                                <a href="" className="text-blue-600 underline">Termos de Serviços</a> e{' '}
                                <a href="" className="text-blue-600 underline">Política de Privacidade</a>.
                            </span>
                        </label>
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

export default RegisterCliente;
