import React from 'react';
import {renderToString} from 'react-dom/server';
import {App} from './App';
import {setTimeFormat} from '#lib/time-format';
export function render(){setTimeFormat('unix'); return renderToString(<React.StrictMode><App/></React.StrictMode>);}
