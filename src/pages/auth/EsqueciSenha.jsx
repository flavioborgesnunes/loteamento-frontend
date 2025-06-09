import React, { useState } from 'react';
import axios from '../../utils/axios';
import Swal from 'sweetalert2';
import Contact from '../../components/Contact';
import imagemAuth from '../auth/images/img-auth.png'
import logo from '../auth/images/logoctz.png'


export default function EsqueciSenha() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState(null);
    const [enviado, setEnviado] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        try {
            await axios.get(`user/password-reset/${email}/`);
            setEnviado(true);

            Swal.fire({
                icon: 'success',
                title: 'E-mail enviado!',
                text: 'Verifique sua caixa de entrada para redefinir a senha.',
            });
        } catch (err) {
            setError("Erro ao enviar e-mail. Verifique o e-mail informado.");
        }
    };

    return (
        <section className="flex flex-col items-center justify-center">
            <div className='flex w-full'>
                <div className='flex flex-1 flex-col justify-center items-center p-3'>
                    <h2 className="text-3xl md:text-4xl text-center font-bold gradiente my-10 w-full">Esqueci minha senha</h2>
                    <p className='font-bold mb-5'>Você receberá um e-mail em até 60 segundos</p>

                    {error && <div className="bg-red-100 text-red-700 p-2 mb-4 rounded">{error}</div>}
                    {enviado && (
                        <div className="bg-green-100 text-green-700 p-2 mb-4 rounded">
                            Se o e-mail estiver correto, você receberá um link para redefinir a senha.
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="w-full md:w-[460px]">
                        <label className="block mb-2 text-sm font-bold">Email</label>
                        <input
                            type="email"
                            className="w-full h-10 mb-4 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Digite seu e-mail"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                        <button
                            type="submit"
                            className='bg-linear-to-r from-padrao-100 to-padrao-900 w-full h-10 rounded-md mt-3 text-white cursor-pointer'>
                            Enviar link de redefinição
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
