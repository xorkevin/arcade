package main

import (
	"xorkevin.dev/arcade/pkg/room"
	"xorkevin.dev/arcade/pkg/ws"
	"xorkevin.dev/governor"
)

func main() {
	vcsinfo := governor.ReadVCSBuildInfo()
	opts := governor.Opts{
		Appname: "arcade",
		Version: governor.Version{
			Num:  vcsinfo.ModVersion,
			Hash: vcsinfo.VCSStr(),
		},
		Description:   "Arcade is an online hub",
		DefaultFile:   "arcade",
		EnvPrefix:     "arcade",
		ClientDefault: "arcadec",
		ClientPrefix:  "arcadec",
	}

	g := governor.New(opts, nil)
	wsService := ws.New()
	g.Register("ws", "/ws", wsService)
	roomService := room.New()
	g.Register("room", "/null/room", roomService)
	wsService.Handle("arcade.room", roomService)

	cmd := governor.NewCmd(opts, nil, g, nil)
	cmd.Execute()
}
