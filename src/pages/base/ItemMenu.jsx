import { Home } from 'lucide-react';
import PropTypes from 'prop-types';
import { Link, useLocation } from 'react-router-dom';

export default function ItemMenu({ icon: Icon = Home, text = 'Início', to = '/' }) {
    const location = useLocation();
    const isActive = location.pathname === to;

    return (
        <Link
            to={to}
            className={`group flex items-center gap-3 w-full px-4 py-2 rounded-lg transition-all duration-200 my-1
        bg-white text-gray-800 hover:shadow-md hover:scale-105
        ${isActive ? 'shadow-md scale-105' : ''}`}
        >
            {/* Ícone — só muda se estiver ativo */}
            <div
                className={`w-10 h-10 rounded-md flex items-center justify-center transition-all duration-300
                    ${isActive ? 'bg-gradient-to-r from-padrao-100 to-padrao-900 text-white' : ''}
                `}
            >
                <Icon
                    className={`w-7 h-7 transition-colors duration-300  group-hover:text-black
                        ${isActive ? 'text-white' : 'text-gray-400'}
                    `}
                />
            </div>

            <span
                className={`text-lg font-medium transition-colors duration-200
                    ${isActive ? 'text-black' : 'text-gray-400 group-hover:text-black'}
                `}
            >
                {text}
            </span>
        </Link>
    );
}

ItemMenu.propTypes = {
    icon: PropTypes.elementType,
    text: PropTypes.string,
    to: PropTypes.string,
};
