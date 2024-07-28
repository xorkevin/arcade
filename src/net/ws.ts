import {createContext} from 'react';

import {WS} from '@xorkevin/nuke/net';

export const WSContext = createContext(new WS('ws://localhost:3000'));
