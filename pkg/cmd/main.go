package main

import (
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
	g.Register("ws", "/ws", ws.New())

	cmd := governor.NewCmd(opts, nil, g, nil)
	cmd.Execute()
}
