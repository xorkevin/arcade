package ws

import (
	"context"
	"encoding/json"
	"time"

	"nhooyr.io/websocket"
	"xorkevin.dev/governor"
	"xorkevin.dev/governor/util/kjson"
	"xorkevin.dev/governor/util/ktime"
	"xorkevin.dev/governor/util/uid"
	"xorkevin.dev/kerrors"
)

const (
	wsSubprotocol = "xorkevin.dev-arcade.v1alpha1"
)

type (
	clientReqMsgBytes struct {
		ID      string          `json:"id"`
		Channel string          `json:"ch"`
		Value   json.RawMessage `json:"v"`
	}

	ReqMsgBytes struct {
		ID      string          `json:"id"`
		Channel string          `json:"ch"`
		Userid  string          `json:"uid"`
		Value   json.RawMessage `json:"v"`
	}

	ResMsgBytes struct {
		ID      string          `json:"id"`
		Channel string          `json:"ch"`
		Value   json.RawMessage `json:"v"`
	}
)

const (
	ctlChannel = "_ctl_"
)

func decodeClientReqMsg(b []byte) (*clientReqMsgBytes, error) {
	var m clientReqMsgBytes
	if err := kjson.Unmarshal(b, &m); err != nil {
		return nil, governor.ErrWS(err, int(websocket.StatusInvalidFramePayloadData), "Malformed request msg")
	}
	return &m, nil
}

func (s *router) ws(c *governor.Context) {
	conn, err := c.Websocket([]string{wsSubprotocol})
	if err != nil {
		s.s.log.WarnErr(c.Ctx(), kerrors.WithMsg(err, "Failed to accept websocket conn upgrade"))
		return
	}
	if conn.Subprotocol() != wsSubprotocol {
		conn.CloseError(governor.ErrWS(nil, int(websocket.StatusPolicyViolation), "Invalid websocket subprotocol"))
		return
	}
	defer conn.Close(int(websocket.StatusInternalError), "Internal error")

	connUid, err := uid.New()
	if err != nil {
		conn.CloseError(governor.ErrWS(nil, int(websocket.StatusInternalError), "Failed to generate connection uid"))
		return
	}
	connid := connUid.Base64()

	ctx, cancel := context.WithCancel(c.Ctx())
	defer cancel()

	for {
		isText, b, err := conn.Read(c.Ctx())
		if err != nil {
			conn.CloseError(err)
			return
		}
		if !isText {
			conn.CloseError(governor.ErrWS(nil, int(websocket.StatusUnsupportedData), "Invalid msg type binary"))
			return
		}

		m, err := decodeClientReqMsg(b)
		if err != nil {
			conn.CloseError(err)
			return
		}
		if len(m.ID) > 127 {
			conn.CloseError(governor.ErrWS(nil, int(websocket.StatusInvalidFramePayloadData), "Invalid msg id"))
			return
		}
		if m.Channel == "" || len(m.Channel) > 127 {
			conn.CloseError(governor.ErrWS(nil, int(websocket.StatusInvalidFramePayloadData), "Invalid msg channel"))
			return
		}

		if m.Channel == ctlChannel {
			if err := s.handleCtlMsg(ctx, conn, *m); err != nil {
				conn.CloseError(err)
				return
			}
		} else {
			msg := ReqMsgBytes{
				ID:      m.ID,
				Channel: m.Channel,
				Userid:  connid,
				Value:   m.Value,
			}
			for _, h := range s.s.handlers[m.Channel] {
				if err := h.Handle(ctx, conn, msg); err != nil {
					conn.CloseError(err)
					return
				}
			}
		}

		if err := ktime.After(ctx, 64*time.Millisecond); err != nil {
			return
		}
	}
}

const (
	ctlOpPing = "ping"
)

type (
	ctlOp struct {
		Op   string          `json:"op"`
		Args json.RawMessage `json:"args"`
	}

	ctlOps struct {
		Ops []ctlOp `json:"ops"`
	}

	ctlResPing struct {
		ReqTime         int64 `json:"t"`
		ProcessDuration int64 `json:"d"`
	}
)

func (s *router) handleCtlMsg(ctx context.Context, conn *governor.Websocket, m clientReqMsgBytes) error {
	start := time.Now()

	var ops ctlOps
	if err := kjson.Unmarshal(m.Value, &ops); err != nil {
		return governor.ErrWS(err, int(websocket.StatusInvalidFramePayloadData), "Invalid ctl op msg")
	}

	var pingOk bool

	for _, i := range ops.Ops {
		switch i.Op {
		case ctlOpPing:
			pingOk = true
		default:
			return governor.ErrWS(nil, int(websocket.StatusInvalidFramePayloadData), "Invalid ctl op")
		}
	}

	if pingOk {
		processDuration := time.Since(start)
		p, err := kjson.Marshal(ctlResPing{
			ReqTime:         start.Round(0).UnixMilli(),
			ProcessDuration: processDuration.Milliseconds(),
		})
		if err != nil {
			return governor.ErrWS(err, int(websocket.StatusInternalError), "Failed to encode ping res")
		}
		b, err := kjson.Marshal(ResMsgBytes{
			ID:      m.ID,
			Channel: m.Channel,
			Value:   p,
		})
		if err != nil {
			return governor.ErrWS(err, int(websocket.StatusInternalError), "Failed to encode ping res")
		}
		if err := conn.Write(ctx, true, b); err != nil {
			return governor.ErrWS(err, int(websocket.StatusProtocolError), "Failed to write to ws connection")
		}
	}
	return nil
}

func (s *router) mountRoutes(r governor.Router) {
	m := governor.NewMethodRouter(r)
	m.AnyCtx("", s.ws)
}
