import React from 'react'

function Contact() {
    return (
        <div className='flex flex-col justify-center items-center w-full md:w-[500px] mt-20'>

            <div className='w-full px-5 flex justify-between'>
                <a className='text-gray-400 md:text-2xl hover:scale-110 duration-100 hover:cursor-pointer'>Home</a>
                <a className='text-gray-400 md:text-2xl hover:scale-110 duration-100 hover:cursor-pointer'>Sobre Nós</a>
                <a className='text-gray-400 md:text-2xl hover:scale-110 duration-100 hover:cursor-pointer'>Produtos</a>
                <a className='text-gray-400 md:text-2xl hover:scale-110 duration-100 hover:cursor-pointer'>Blog</a>
            </div>

            <div className="flex  gap-5 md:gap-10 justify-center w-full px-5 text-2xl text-gray-400 mt-10">
                <a href="#" target="_blank" rel="noopener noreferrer">
                    <i className="fab fa-whatsapp text-2xl md:text-3xl hover:scale-120 hover:text-green-500 duration-100 "></i>
                </a>
                <a href="#" target="_blank" rel="noopener noreferrer">
                    <i className="fab fa-instagram text-2xl md:text-3xl hover:scale-120 hover:text-red-500 duration-100 "></i>
                </a>
                <a href="#" target="_blank" rel="noopener noreferrer">
                    <i className="fab fa-linkedin text-2xl md:text-3xl hover:scale-120 hover:text-blue-800 duration-100 "></i>
                </a>
                <a href="#" target="_blank" rel="noopener noreferrer">
                    <i className="fab fa-x-twitter text-2xl md:text-3xl hover:scale-120 hover:text-black duration-100 "></i>
                </a>
                <a href="#" target="_blank" rel="noopener noreferrer">
                    <i className="fab fa-facebook text-2xl md:text-3xl hover:scale-120 hover:text-blue-600 duration-100 "></i>
                </a>
            </div>
            <div className='mt-8'>
                <p className='text-gray-400'>Copyright © 2025 <strong>LoteNet</strong>.</p>
            </div>
        </div>
    )
}

export default Contact
