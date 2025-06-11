import React from 'react'
import { useAuthStore } from '../../store/auth';
import { Bell, User, Settings, CircleUserRound, Ellipsis } from 'lucide-react';
import NovoEstudo from './images/projeto-novo-estudo.png'

function Projetos() {
    const user = useAuthStore(state => state.allUserData);
    return (
        <>
            <div className='flex mt-10 justify-between px-5 text-white'>
                <h1 className="text-xl">Projetos</h1>
                <div className='flex gap-5 mr-5 font-bold'>
                    <User className='mr-1' />
                    <p className='pr-5 border-r-1' >Fale com um especialista</p>
                    <input type="text" className='bg-white rounded-md pl-3 font-extralight text-sm' placeholder='Pesquisar' />
                    <Bell />
                    <Settings />
                    <CircleUserRound />
                    <p>{user?.email}</p>
                </div>
            </div>
            <div className="w-full mt-10 shadow-md bg-white rounded-2xl p-5">
                <p className='pt-2 text-2xl font-bold mb-18'>Projetos</p>

                <div className='grid grid-cols-5 gap-5 justify-around'>

                    <img src={NovoEstudo} alt="" className='col' />
                    <div className='shadow-md h-78 grow-1 p-5 rounded-xl col'>
                        <div className='flex justify-between items-center'>
                            <p className='bg-[#00BBF2] text-white font-bold py-0.5 px-4 rounded-2xl'>Aprovação</p>
                            <Ellipsis className='w-8 h-8' />
                        </div>
                        <div className='flex flex-col'>
                            <h4 className='font-bold text-xl mt-5'>Nome do Estudo</h4>
                            <h5 className='font-bold mt-1'>Responsável</h5>
                            <p>Diego Marques</p>
                            <h5 className='font-bold mt-1'>Localidade</h5>
                            <p>Recife/PE</p>
                            <h5 className='font-bold mt-1'>Última Atualização</h5>
                            <p>01/06/2025</p>
                        </div>
                    </div>
                    <div className='shadow-md h-78 grow-1 p-5 rounded-xl col'>
                        <div className='flex justify-between items-center'>
                            <p className='bg-[#00BBF2] text-white font-bold py-0.5 px-4 rounded-2xl'>Aprovação</p>
                            <Ellipsis className='w-8 h-8' />
                        </div>
                        <div className='flex flex-col'>
                            <h4 className='font-bold text-xl mt-5'>Nome do Estudo</h4>
                            <h5 className='font-bold mt-1'>Responsável</h5>
                            <p>Diego Marques</p>
                            <h5 className='font-bold mt-1'>Localidade</h5>
                            <p>Recife/PE</p>
                            <h5 className='font-bold mt-1'>Última Atualização</h5>
                            <p>01/06/2025</p>
                        </div>
                    </div>
                    <div className='shadow-md h-78 grow-1 p-5 rounded-xl col'>
                        <div className='flex justify-between items-center'>
                            <p className='bg-[#00BBF2] text-white font-bold py-0.5 px-4 rounded-2xl'>Aprovação</p>
                            <Ellipsis className='w-8 h-8' />
                        </div>
                        <div className='flex flex-col'>
                            <h4 className='font-bold text-xl mt-5'>Nome do Estudo</h4>
                            <h5 className='font-bold mt-1'>Responsável</h5>
                            <p>Diego Marques</p>
                            <h5 className='font-bold mt-1'>Localidade</h5>
                            <p>Recife/PE</p>
                            <h5 className='font-bold mt-1'>Última Atualização</h5>
                            <p>01/06/2025</p>
                        </div>
                    </div>
                    <div className='shadow-md h-78 grow-1 p-5 rounded-xl col'>
                        <div className='flex justify-between items-center'>
                            <p className='bg-[#00BBF2] text-white font-bold py-0.5 px-4 rounded-2xl'>Aprovação</p>
                            <Ellipsis className='w-8 h-8' />
                        </div>
                        <div className='flex flex-col'>
                            <h4 className='font-bold text-xl mt-5'>Nome do Estudo</h4>
                            <h5 className='font-bold mt-1'>Responsável</h5>
                            <p>Diego Marques</p>
                            <h5 className='font-bold mt-1'>Localidade</h5>
                            <p>Recife/PE</p>
                            <h5 className='font-bold mt-1'>Última Atualização</h5>
                            <p>01/06/2025</p>
                        </div>
                    </div>
                    <div className='shadow-md h-78 grow-1 p-5 rounded-xl col'>
                        <div className='flex justify-between items-center'>
                            <p className='bg-[#00BBF2] text-white font-bold py-0.5 px-4 rounded-2xl'>Aprovação</p>
                            <Ellipsis className='w-8 h-8' />
                        </div>
                        <div className='flex flex-col'>
                            <h4 className='font-bold text-xl mt-5'>Nome do Estudo</h4>
                            <h5 className='font-bold mt-1'>Responsável</h5>
                            <p>Diego Marques</p>
                            <h5 className='font-bold mt-1'>Localidade</h5>
                            <p>Recife/PE</p>
                            <h5 className='font-bold mt-1'>Última Atualização</h5>
                            <p>01/06/2025</p>
                        </div>
                    </div>
                    <div className='shadow-md h-78 grow-1 p-5 rounded-xl col'>
                        <div className='flex justify-between items-center'>
                            <p className='bg-[#00BBF2] text-white font-bold py-0.5 px-4 rounded-2xl'>Aprovação</p>
                            <Ellipsis className='w-8 h-8' />
                        </div>
                        <div className='flex flex-col'>
                            <h4 className='font-bold text-xl mt-5'>Nome do Estudo</h4>
                            <h5 className='font-bold mt-1'>Responsável</h5>
                            <p>Diego Marques</p>
                            <h5 className='font-bold mt-1'>Localidade</h5>
                            <p>Recife/PE</p>
                            <h5 className='font-bold mt-1'>Última Atualização</h5>
                            <p>01/06/2025</p>
                        </div>
                    </div>
                    <div className='shadow-md h-78 grow-1 p-5 rounded-xl col'>
                        <div className='flex justify-between items-center'>
                            <p className='bg-[#00BBF2] text-white font-bold py-0.5 px-4 rounded-2xl'>Aprovação</p>
                            <Ellipsis className='w-8 h-8' />
                        </div>
                        <div className='flex flex-col'>
                            <h4 className='font-bold text-xl mt-5'>Nome do Estudo</h4>
                            <h5 className='font-bold mt-1'>Responsável</h5>
                            <p>Diego Marques</p>
                            <h5 className='font-bold mt-1'>Localidade</h5>
                            <p>Recife/PE</p>
                            <h5 className='font-bold mt-1'>Última Atualização</h5>
                            <p>01/06/2025</p>
                        </div>
                    </div>
                </div>
            </div>

        </>
    )
}

export default Projetos
