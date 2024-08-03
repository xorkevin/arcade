package room

import (
	"context"
	"fmt"
	"sync"
	"time"

	"nhooyr.io/websocket"
	"xorkevin.dev/arcade/pkg/ws"
	"xorkevin.dev/governor"
	"xorkevin.dev/governor/util/kjson"
	"xorkevin.dev/governor/util/ksync"
	"xorkevin.dev/kerrors"
	"xorkevin.dev/klog"
)

type (
	Service struct {
		log   *klog.LevelLogger
		wg    *ksync.WaitGroup
		lock  *sync.Mutex
		rooms map[string]*roomState
	}

	roomState struct {
		ID      string                  `json:"room"`
		Members map[string]*memberState `json:"members"`
		Video   string                  `json:"video"`
		Pos     int64                   `json:"pos"`
		Play    bool                    `json:"play"`
		CtlAt   int64                   `json:"ctlat"`
		At      int64                   `json:"at"`
		Ctr     uint32                  `json:"ctr"`
	}

	memberState struct {
		Name  string `json:"name"`
		Ping  int64  `json:"ping,omitempty"`
		Pos   int64  `json:"pos"`
		Play  bool   `json:"play"`
		Ready bool   `json:"ready"`
		At    int64  `json:"at"`
		w     ws.WSWriter
	}

	reqPing struct {
		Room  string `json:"room"`
		Name  string `json:"name"`
		Ping  int64  `json:"ping"`
		Pos   int64  `json:"pos"`
		Play  bool   `json:"play"`
		Ready bool   `json:"ready"`
	}

	reqCtl struct {
		Room  string `json:"room"`
		Video string `json:"video"`
		Pos   int64  `json:"pos"`
		Play  bool   `json:"play"`
	}

	resRoomState struct {
		ID          string                  `json:"room"`
		Members     map[string]*memberState `json:"members"`
		Video       string                  `json:"video"`
		Pos         int64                   `json:"pos"`
		Play        bool                    `json:"play"`
		CtlAt       int64                   `json:"ctlat"`
		At          int64                   `json:"at"`
		ResDuration int64                   `json:"d"`
		Ctr         uint32                  `json:"ctr"`
	}

	resCtl struct {
		Room  string `json:"room"`
		Video string `json:"video"`
		Pos   int64  `json:"pos"`
		Play  bool   `json:"play"`
		CtlAt int64  `json:"ctlat"`
		At    int64  `json:"at"`
		Ctr   uint32 `json:"ctr"`
	}
)

func New() *Service {
	return &Service{
		wg:    ksync.NewWaitGroup(),
		lock:  &sync.Mutex{},
		rooms: map[string]*roomState{},
	}
}

func (s *Service) Register(r governor.ConfigRegistrar) {
}

func (s *Service) Init(ctx context.Context, r governor.ConfigReader, kit governor.ServiceKit) error {
	s.log = klog.NewLevelLogger(kit.Logger)

	go s.gcLoop(ctx, s.wg)

	return nil
}

func (s *Service) Start(ctx context.Context) error {
	return nil
}

func (s *Service) Stop(ctx context.Context) {
	if err := s.wg.Wait(ctx); err != nil {
		s.log.WarnErr(ctx, kerrors.WithMsg(err, "Failed to stop"))
	}
}

func (s *Service) Setup(ctx context.Context, req governor.ReqSetup) error {
	return nil
}

func (s *Service) Health(ctx context.Context) error {
	return nil
}

func (s *Service) gcLoop(ctx context.Context, wg *ksync.WaitGroup) {
	defer wg.Done()

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		s.gcRooms()

		s.delay(ctx)
	}
}

func (s *Service) delay(ctx context.Context) {
	t, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	<-t.Done()
}

func (s *Service) gcRooms() {
	s.lock.Lock()
	defer s.lock.Unlock()

	now := time.Now().UnixMilli()
	for k, v := range s.rooms {
		if v.At+7000 < now {
			delete(s.rooms, k)
		}
	}
}

func (s *Service) Handle(ctx context.Context, w ws.WSWriter, m ws.ReqMsgBytes) error {
	start := time.Now().UnixMilli()
	switch m.Channel {
	case "arcade.room.ping":
		if err := s.handlePingRoom(ctx, w, m, start); err != nil {
			return err
		}
	case "arcade.room.ctl":
		if err := s.handleCtlRoom(ctx, m); err != nil {
			return err
		}
	default:
		return governor.ErrWS(nil, int(websocket.StatusInvalidFramePayloadData), fmt.Sprintf("Unexpected channel %s", m.Channel))
	}
	return nil
}

func (s *Service) handlePingRoom(ctx context.Context, w ws.WSWriter, m ws.ReqMsgBytes, start int64) error {
	var req reqPing
	if err := kjson.Unmarshal(m.Value, &req); err != nil {
		return governor.ErrWS(err, int(websocket.StatusInvalidFramePayloadData), "Invalid req body")
	}

	if req.Room == "" {
		return governor.ErrWS(nil, int(websocket.StatusInvalidFramePayloadData), "Room not provided")
	}
	if len(req.Room) > 127 {
		return governor.ErrWS(nil, int(websocket.StatusInvalidFramePayloadData), "Invalid room")
	}
	if len(req.Name) > 127 {
		return governor.ErrWS(nil, int(websocket.StatusInvalidFramePayloadData), "Invalid name")
	}

	if req.Ping > 5000 || req.Ping < -1 {
		req.Ping = -1
	}

	b, sinks, err := s.pingRoom(req.Room, m.Userid, w, req, start)
	if err != nil {
		return err
	}
	res, err := kjson.Marshal(ws.ResMsgBytes{
		ID:      m.ID,
		Channel: m.Channel,
		Value:   b,
	})
	if err != nil {
		return kerrors.WithMsg(err, "Failed to marshal room state")
	}
	if err := w.Write(ctx, true, res); err != nil {
		return governor.ErrWS(err, int(websocket.StatusProtocolError), "Failed to write to ws connection")
	}
	for _, i := range sinks {
		if err := i.Write(ctx, true, res); err != nil {
			s.log.Err(ctx, kerrors.WithMsg(err, "Failed to forward ping to ws connection"))
		}
	}
	return nil
}

func (s *Service) pingRoom(room string, id string, w ws.WSWriter, req reqPing, at int64) ([]byte, []ws.WSWriter, error) {
	s.lock.Lock()
	defer s.lock.Unlock()

	r, ok := s.rooms[room]
	if !ok {
		r = &roomState{
			ID:      room,
			Members: map[string]*memberState{},
			CtlAt:   at,
			Ctr:     0,
		}
		s.rooms[room] = r
	}

	m, ok := r.Members[id]
	if !ok {
		m = &memberState{}
		r.Members[id] = m
	}

	m.Name = req.Name
	m.Ping = req.Ping
	m.Pos = req.Pos
	m.Play = req.Play
	m.Ready = req.Ready
	m.At = at
	m.w = w

	sinks := make([]ws.WSWriter, 0, len(r.Members)-1)
	now := time.Now().UnixMilli()
	for k, v := range r.Members {
		if v.At+7000 < now {
			delete(r.Members, k)
		} else if k != id {
			sinks = append(sinks, v.w)
		}
	}

	r.Ctr++
	r.At = time.Now().UnixMilli()

	b, err := kjson.Marshal(resRoomState{
		ID:          r.ID,
		Members:     r.Members,
		Video:       r.Video,
		Pos:         r.Pos,
		Play:        r.Play,
		CtlAt:       r.CtlAt,
		At:          r.At,
		ResDuration: r.At - at,
		Ctr:         r.Ctr,
	})
	if err != nil {
		return nil, nil, kerrors.WithMsg(err, "Failed to marshal room state")
	}
	return b, sinks, nil
}

func (s *Service) handleCtlRoom(ctx context.Context, m ws.ReqMsgBytes) error {
	var req reqCtl
	if err := kjson.Unmarshal(m.Value, &req); err != nil {
		return governor.ErrWS(err, int(websocket.StatusInvalidFramePayloadData), "Invalid req body")
	}

	if req.Room == "" {
		return governor.ErrWS(nil, int(websocket.StatusInvalidFramePayloadData), "Room not provided")
	}
	if len(req.Room) > 127 {
		return governor.ErrWS(nil, int(websocket.StatusInvalidFramePayloadData), "Invalid room")
	}
	if len(req.Video) > 8192 {
		return governor.ErrWS(nil, int(websocket.StatusInvalidFramePayloadData), "Invalid video")
	}
	if req.Pos < 0 {
		return governor.ErrWS(nil, int(websocket.StatusInvalidFramePayloadData), "Invalid pos")
	}

	b, sinks, err := s.ctlRoom(req.Room, m.Userid, req)
	if err != nil {
		return err
	}
	res, err := kjson.Marshal(ws.ResMsgBytes{
		ID:      m.ID,
		Channel: m.Channel,
		Value:   b,
	})
	if err != nil {
		return kerrors.WithMsg(err, "Failed to marshal room control message")
	}
	for _, i := range sinks {
		if err := i.Write(ctx, true, res); err != nil {
			s.log.Err(ctx, kerrors.WithMsg(err, "Failed to write to ws connection"))
		}
	}
	return nil
}

func (s *Service) ctlRoom(room string, id string, req reqCtl) ([]byte, []ws.WSWriter, error) {
	s.lock.Lock()
	defer s.lock.Unlock()

	r, ok := s.rooms[room]
	if !ok {
		return nil, nil, kerrors.WithMsg(nil, "Invalid room")
	}

	if _, ok := r.Members[id]; !ok {
		return nil, nil, kerrors.WithMsg(nil, "Not member of room")
	}

	r.Video = req.Video
	r.Pos = req.Pos
	r.Play = req.Play

	sinks := make([]ws.WSWriter, 0, len(r.Members))
	now := time.Now().UnixMilli()
	for k, v := range r.Members {
		if v.At+7000 < now {
			delete(r.Members, k)
		} else {
			sinks = append(sinks, v.w)
		}
	}

	r.Ctr++
	r.CtlAt = time.Now().UnixMilli()
	r.At = r.CtlAt

	b, err := kjson.Marshal(resCtl{
		Room:  r.ID,
		Video: r.Video,
		Pos:   r.Pos,
		Play:  r.Play,
		CtlAt: r.CtlAt,
		At:    r.At,
		Ctr:   r.Ctr,
	})
	if err != nil {
		return nil, nil, kerrors.WithMsg(err, "Failed to marshal room control message")
	}
	return b, sinks, nil
}
