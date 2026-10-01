import React from 'react';
import {useTimeFormat, TimeColumnHeader, FormattedTimestamp} from '#comps/TimeFormat';
export function Consumer({id}: {id:string}) {
 const state = useTimeFormat();
 if (typeof window !== 'undefined') (window as any).controls[id] = state;
 return <section data-id={id}><output>{state.timeFormat}</output><TimeColumnHeader label={id} formatLabel={state.formatLabel} onCycle={state.cycleTimeFormat}/><FormattedTimestamp timestamp={1700000000n} format={state.timeFormat}/></section>;
}
export function App() {
 const [route, setRoute] = React.useState(0);
 const [visible, setVisible] = React.useState(true);
 return <><button id="navigate" onClick={()=>setRoute(x=>x+1)}>Navigate</button><button id="toggle" onClick={()=>setVisible(x=>!x)}>Toggle</button><div key={route}>{visible && <Consumer id="first"/>}<Consumer id="second"/></div></>;
}
