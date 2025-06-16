import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { logout } from '../../utils/auth';
import { useAuthStore } from '../../store/auth';
import useAutoLogout from '../../hooks/useAutoLogout';
import { Bell, User, Settings, CircleUserRound } from 'lucide-react';
import mapa from './images/mapa.png'


function Dashboard() {
    useAutoLogout();
    const user = useAuthStore(state => state.allUserData);
    const perfilUser = useAuthStore(state => state.perfilUser);

    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <>
            <div className='flex mt-10 justify-between items-center px-5 text-white'>
                <h1 className="text-xl">Dashboard</h1>
                <div className='flex gap-5 mr-5 font-bold items-center'>
                    <User className='mr-1' />
                    <p className='pr-5 border-r-1' >Fale com um especialista</p>
                    <input type="text" className='bg-white rounded-md pl-3 font-extralight text-sm' placeholder='Pesquisar' />
                    <Bell />
                    <Settings />
                    {perfilUser?.foto ? (
                        <img src={perfilUser?.foto} className='rounded-full w-10 h-10' />
                    ) : <CircleUserRound />}
                    {perfilUser?.nome ? (

                        <p>Bem-vindo, {perfilUser?.nome || 'Usuário'} {perfilUser?.sobrenome || ''}</p>
                    ) : <p>{user.email}</p>
                    }

                </div>
            </div>
            <div className="flex w-full justify-center gap-5 pb-10">
                {/* Coluna 1 - 60% */}
                <div className="basis-6/10 grid grid-cols-3 gap-5 mt-10">
                    <div className="flex flex-col justify-around bg-linear-to-r from-padrao-100 to-padrao-900 h-60 p-5 rounded-2xl text-white">
                        <h1 className='font-bold text-lg xl:text-xl '>Deixe a IA guiar seu próximo estudo</h1>
                        <p className='justify-self-center text-center text-xs/5 line-clamp-3 font-bold'>Inicie um novo processo cadastrando as informações do terreno e importando os arquivos. O sistema cuidará do restante.</p>
                        <a href='/estudo' className='w-50 self-center rounded-md bg-white text-padrao-900 text-sm font-bold mt-5 h-10 flex items-center justify-center'>Criar Projeto com IA</a>
                    </div>
                    <div className="bg-blue-100 h-60 p-4 rounded-2xl">Item 2</div>
                    <div className="bg-blue-100 h-60 p-4 rounded-2xl">Item 3</div>
                    <img src={mapa} alt="" className='col-span-3' />
                </div>

                {/* Coluna 2 - 40% */}
                <div className="basis-4/10 grid grid-cols-2 mt-10 gap-5">
                    <div className="bg-blue-100 h-[22em] p-4 rounded-2xl col-span-2">Item 4</div>
                    <div className="bg-blue-100 h-50 p-4 rounded-2xl col-span-2">Item 5</div>
                    <div className="bg-blue-100 h-50 p-4 rounded-2xl">Item 6</div>
                    <div className="bg-blue-100 h-50 p-4 rounded-2xl">Item 7</div>

                </div>
            </div>
            <div>

                <div className="flex justify-between items-center mb-6">

                    <button
                        onClick={handleLogout}
                        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition"
                    >
                        Sair
                    </button>
                </div>

                <div className="bg-white p-4 rounded shadow-md">
                    <p className="mb-2">Bem-vindo, <strong>{user?.email}</strong></p>
                    <p className="mb-4">Papel: <strong>{user?.role}</strong></p>

                    {(user.role === 'dono' || user.role === 'adm') && (
                        <Link
                            to="/register-usuario"
                            className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                        >
                            Adicionar Usuário
                        </Link>
                    )}
                </div>
            </div>
        </>
    );
}

export default Dashboard;