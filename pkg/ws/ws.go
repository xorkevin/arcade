package ws

import (
	"context"

	"xorkevin.dev/governor"
	"xorkevin.dev/klog"
)

type (
	Service struct {
		scopens string
		log     *klog.LevelLogger
	}

	router struct {
		s *Service
	}
)

// New creates a new [Service]
func New() *Service {
	return &Service{}
}

func (s *Service) Register(r governor.ConfigRegistrar) {
	s.scopens = r.Name()
}

func (s *Service) router() *router {
	return &router{
		s: s,
	}
}

func (s *Service) Init(ctx context.Context, r governor.ConfigReader, kit governor.ServiceKit) error {
	s.log = klog.NewLevelLogger(kit.Logger)

	sr := s.router()
	sr.mountRoutes(kit.Router)
	s.log.Info(ctx, "Mounted http routes")
	return nil
}

func (s *Service) Start(ctx context.Context) error {
	return nil
}

func (s *Service) Stop(ctx context.Context) {
}

func (s *Service) Setup(ctx context.Context, req governor.ReqSetup) error {
	return nil
}

func (s *Service) Health(ctx context.Context) error {
	return nil
}
