import {createContext} from 'react';

import {WS} from '@xorkevin/nuke/net';

export const WSContext = createContext<{
  ws: WS;
  pingRef: {current: number | undefined};
}>({
  ws: new WS('ws://localhost:3000'),
  pingRef: {current: undefined},
});
