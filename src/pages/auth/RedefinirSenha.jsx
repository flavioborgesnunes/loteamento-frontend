import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from '../../utils/axios';
import Swal from 'sweetalert2';
import imagemAuth from '../auth/images/img-auth.png'
import Contact from '../../components/Contact';
import logo from '../auth/images/logoctz.png'




export default function RedefinirSenha() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const uidb64 = searchParams.get("uidb64");
    const otp = searchParams.get("otp");

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            setError("As senhas não coincidem.");
            return;
        }

        try {
            const response = await axios.post('user/password-change/', {
                otp,
                uidb64,
                password,
            });

            Swal.fire({
                icon: 'success',
                title: 'Senha redefinida com sucesso!',
            });

            navigate('/login');
        } catch (err) {
            setError(
                err.response?.data?.message ||
                "Erro ao redefinir a senha. Verifique se o link é válido."
            );
        }
    };

    return (
        <section className="flex flex-col items-center justify-center">
            <div className='flex w-full'>
                <div className='flex flex-1 flex-col justify-center items-center p-3'>
                    <h1 className="text-3xl md:text-4xl text-center font-bold gradiente my-10 w-full">Redefinição de Senha</h1>

                    <h2 className='font-bold text-medium mb-4'>Digite o seu endereço de e-mail e senha para se cadastrar</h2>
                    <p className='whitespace-pre-line md:w-[460px] mb-10  text-sm/7'>
                        {`Não pode ser muito parecida com o resto das suas informações pessoais.
                        Precisa conter pelo menos 8 caracteres.
                        Não pode ser uma senha comumente utilizada.
                        Não pode ser inteiramente numérica.`}
                    </p>
                    {error && <div className="bg-red-100 text-red-700 p-2 mb-4 rounded">{error}</div>}

                    <form onSubmit={handleSubmit} className="w-full md:w-[460px]">

                        <label className="block mb-2 text-sm font-bold">Nova Senha</label>
                        <input
                            type="password"
                            className="w-full h-10 mb-4 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Nova senha"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                        />

                        <label className="block mb-2 text-sm font-bold">Confirmação de nova senha</label>
                        <input
                            type="password"
                            className="w-full h-10 mb-4 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Confirme a nova senha"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                        <button
                            type="submit"
                            className="w-full bg-blue-600 text-white px-4 py-2 rounded"
                        >
                            Redefinir Senha
                        </button>
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
